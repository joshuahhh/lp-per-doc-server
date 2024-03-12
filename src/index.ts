import { AutomergeUrl, DocHandle, Repo } from "@automerge/automerge-repo";
import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import * as child_process from "node:child_process";
import * as fsP from "node:fs/promises";
import { BuildOutput, BuildsDoc, Result, getLatestBuild, getLatestSuccessfulBuild, writeNewFile } from "./lp-shared.js";
import { push } from "./push.js";


async function main() {
  const [_1, _2, srcUrl, dstUrl] = process.argv;

  if (!srcUrl || !dstUrl) {
    console.error("needs <srcUrl> <dstUrl>");
    process.exit(1);
  }

  console.log("welcome to lp-per-doc-server");
  console.log("srcUrl", srcUrl);
  console.log("dstUrl", dstUrl);

  const repo = new Repo({
    network: [
      new BrowserWebSocketClientAdapter("wss://sync.automerge.org"),
    ],
  });

  const srcHandle = repo.find(srcUrl as AutomergeUrl);
  const dstHandle = repo.find<BuildsDoc>(dstUrl as AutomergeUrl);

  async function initializeBuild(buildId: string) {
    const doc = await dstHandle.doc();
    if (!doc) {
      throw new Error("dst doc not found");
    }
    if (!doc.builds) {
      dstHandle.change((doc) => {
        doc.builds = {};
      });
    }
    dstHandle.change((doc) => {
      doc.builds[buildId] = {
        id: buildId,
        startTime: new Date(),
        result: null,
      };
    });
  }
  async function setBuildResult(buildId: string, result: Result<BuildOutput, string>, stdout: string, stderr: string) {
    dstHandle.change((doc) => {
      doc.builds[buildId].result = {
        ...result,
        finishTime: new Date(),
        stdout,
        stderr,
      };
    });
    await cleanBuilds();
  }
  async function setBuildError(buildId: string, error: string, stdout: string, stderr: string) {
    await setBuildResult(buildId, { ok: false, error }, stdout, stderr);
  }

  const activeBuildJobs: { [buildId: string]: { abort: () => void } } = {};

  console.log("waiting for dstHandle to be ready")
  await dstHandle.doc();
  console.log("dstHandle is ready")
  // await waitForHandle(dstHandle);

  async function buildDoc(doc: any) {
    // TODO: maybe don't abort every previous job?
    abortAllJobs();

    const buildId = crypto.randomUUID();
    await initializeBuild(buildId);

    if (!('content' in doc) || typeof doc.content !== "string") {
      await setBuildError(buildId, "doc.content is missing or not string", "", "");
      return;
    }
    const content = doc.content;

    const buildDir = `${buildId}/build`;
    const tempDir = `${buildId}/temp`;

    await fsP.writeFile('index.md', content);

    console.log("building", buildId);

    let aborted = false;

    const child = child_process.spawn("node_modules/.bin/lpub", ["-o", buildDir, "--tempDir", tempDir, "index.md"], {
      shell: true,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdouts: string[] = [];
    child.stdout.on("data", (data) => {
      stdouts.push(data.toString());
    });

    let stderrs: string[] = [];
    child.stderr.on("data", (data) => {
      stderrs.push(data.toString());
    });

    child.addListener("exit", async (code) => {
      if (aborted) { return; }
      console.log("lpub exited", code);
      if (code !== 0) {
        await setBuildError(buildId, `lpub exited with code ${code}`, stdouts.join(), stderrs.join());
        return;
      }
      try {
        const result = await fsP.readFile(`${buildDir}/index.pdf`);
        const pdfUrl = await writeNewFile(repo, result);

        let buildDirUrl: AutomergeUrl | null = null;
        try {
          buildDirUrl = await push({ dir: buildDir, repo })
        } catch (e) {
          console.error("error pushing build dir", e);
        }

        await setBuildResult(buildId, { ok: true, value: { pdfUrl, buildDirUrl } }, stdouts.join(), stderrs.join());
      } catch (e) {
        await setBuildError(buildId, "pdf file not written", stdouts.join(), stderrs.join());
      }
      await fsP.rm(`${buildId}`, {recursive: true, force: true});
    });

    activeBuildJobs[buildId] = {
      abort: async () => {
        aborted = true;
        console.log("aborting build", buildId);
        // kill entire detached process group
        try {
          if (!child.pid) {
            throw new Error("child process has no pid?");
          }
          process.kill(-child.pid, 'SIGTERM');
        } catch (e) {
          console.error("error killing process group", child.pid ? -child.pid : "no pid", e);
        }
        // clean up output directory
        await fsP.rm(`${buildId}`, {recursive: true, force: true});
        // mark abort
        const dst = await dstHandle.doc();
        if (dst) {
          if (dst.builds[buildId] && dst.builds[buildId].result === null) {
            await setBuildError(buildId, "aborted", stdouts.join(), stderrs.join());
          }
        } else {
          console.error("dst doc not found", dstUrl);
        }
        delete activeBuildJobs[buildId];
      }
    };
  }

  async function cleanBuilds() {
    // current scheme is that we only keep two documents: latest build and latest successful build
    try {
      const dst = await dstHandle.doc();
      if (!dst) { throw new Error(`dst doc not found ${dstUrl}`); }
      const latestBuild = getLatestBuild(dst);
      const latestSuccessfulBuild = getLatestSuccessfulBuild(dst);
      dstHandle.change((doc) => {
        // TODO: idk how much to put in or outside of dstHandle, dst vs doc, etc.
        for (const buildId of Object.keys(dst.builds)) {
          if (latestBuild?.id !== buildId && latestSuccessfulBuild?.id !== buildId) {
            delete doc.builds[buildId];
          }
        }
      });
    } catch (e) {
      console.error("error cleaning builds", e);
    }
  }

  srcHandle.addListener("change", async (e) => {
    console.log("change!");
    await buildDoc(e.doc);
  });

  function abortAllJobs() {
    for (const job of Object.values(activeBuildJobs)) {
      job.abort();
    }
  }

  process.on('SIGTERM', () => {
    console.log("received SIGTERM");
    abortAllJobs();
    process.exit(1);
  });

  process.on('SIGINT', () => {
    console.log("received SIGINT");
    abortAllJobs();
    process.exit(1);
  });

  console.log("waiting for srcHandle to be ready")
  const initDoc = await srcHandle.doc();
  await buildDoc(initDoc);
}

main();
