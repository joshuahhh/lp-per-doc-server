import { AutomergeUrl, DocHandle, Repo } from "@automerge/automerge-repo";
import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import * as child_process from "node:child_process";
import * as fsP from "node:fs/promises";

type BuildsDoc = {
  builds: { [buildId: string]: Build },
}

type Build = {
  id: string,
  startTime: Date,
  result:
    | Result<BuildOutput, string> & {
        finishTime: Date,
        stdout: string,
        stderr: string,
      }
    | null,
}

type Result<T, E = Error> =
  | { ok: true, value: T }
  | { ok: false, error: E };

type BuildOutput = {
  pdf: Uint8Array,
}

// async function waitForHandle(handle: DocHandle<unknown>) {
//   return new Promise<void>((resolve) => {
//     if (handle.isReady()) {
//       resolve();
//     } else {
//       console.log("setting up listener");
//       const listener = () => {
//         console.log("change!")
//         if (handle.isReady()) {
//           console.log("ready!");
//           handle.removeListener("change", listener);
//           resolve();
//         }
//       }
//       handle.addListener("change", listener);
//     }
//   });

// }

async function main() {
  const [_1, _2, srcUrl, dstUrl] = process.argv;

  if (!srcUrl || !dstUrl) {
    console.error("needs <srcUrl> <dstUrl>");
    process.exit(1);
  }

  console.log("welcome");

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
      dstHandle.change((doc: BuildsDoc) => {
        doc.builds = {};
      });
    }
    dstHandle.change((doc: BuildsDoc) => {
      doc.builds[buildId] = {
        id: buildId,
        startTime: new Date(),
        result: null,
      };
    });
  }
  function setBuildResult(buildId: string, result: Result<BuildOutput, string>, stdout: string, stderr: string) {
    dstHandle.change((doc: BuildsDoc) => {
      doc.builds[buildId].result = {
        ...result,
        finishTime: new Date(),
        stdout,
        stderr,
      };
    });
  }
  function setBuildError(buildId: string, error: string, stdout: string, stderr: string) {
    setBuildResult(buildId, { ok: false, error }, stdout, stderr);
  }

  const activeBuildJobs: { [buildId: string]: { abort: () => void } } = {};

  console.log("waiting for dstHandle to be ready")
  await dstHandle.doc();
  console.log("dstHandle is ready")
  // await waitForHandle(dstHandle);

  async function buildDoc(doc: any) {
    // TODO: maybe don't abort every previous job?
    for (const [buildId, job] of Object.entries(activeBuildJobs)) {
      job.abort();
    }

    const buildId = crypto.randomUUID();
    await initializeBuild(buildId);

    if (!('content' in doc) || typeof doc.content !== "string") {
      setBuildError(buildId, "doc.content is missing or not string", "", "");
      return;
    }
    const content = doc.content;

    const buildDir = `${buildId}/build`;
    const tempDir = `${buildId}/temp`;

    await fsP.writeFile('index.md', content);

    console.log("building", buildId);

    let aborted = false;

    const child = child_process.spawn("npx lpub", ["-o", buildDir, "--tempDir", tempDir, "index.md"], {
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
        setBuildError(buildId, `lpub exited with code ${code}`, stdouts.join(), stderrs.join());
        return;
      }
      try {
        const result = await fsP.readFile(`${buildDir}/index.pdf`);
        setBuildResult(buildId, { ok: true, value: { pdf: result } }, stdouts.join(), stderrs.join());
      } catch (e) {
        setBuildError(buildId, "pdf file not written", stdouts.join(), stderrs.join());
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
            setBuildError(buildId, "aborted", stdouts.join(), stderrs.join());
          }
        } else {
          console.error("dst doc not found", dstUrl);
        }
        delete activeBuildJobs[buildId];
      }
    };
  }

  srcHandle.addListener("change", async (e) => {
    console.log("change!");
    await buildDoc(e.doc);
  });

  function abortAllJobs() {
    for (const [buildId, job] of Object.entries(activeBuildJobs)) {
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
