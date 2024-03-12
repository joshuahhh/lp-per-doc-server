import fs from "fs";
import path from "path";
import process from "process";
import mime from "mime-types";

import { isBinaryFileSync } from "isbinaryfile";
import { next as A } from "@automerge/automerge";
import { AnyDocumentId, AutomergeUrl, DocumentId, Repo } from "@automerge/automerge-repo";
import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";


export async function main() {
  const dir = process.argv[2];
  const syncServerUrl = "wss://sync.automerge.org";
  const test = false;

  /* just an aside to myself but this stuff above is kind of gross and i should fix it */
  const repo = new Repo({
    network: test ? [] : [new BrowserWebSocketClientAdapter(syncServerUrl)],
  });

  await push({ repo, dir });

  console.log("Waiting for changes to sync...");
  // TODO: we need a better mechanism for this
  await new Promise((resolve) => setTimeout(resolve, 500000));

  process.exit(0);
}

export async function push(opts: {
  repo: Repo,
  dir: string,
  automergeDocUrl?: AnyDocumentId,
}): Promise<AutomergeUrl> {
  const { repo, dir, automergeDocUrl } = opts;

  const directoryTree = createNode(dir);

  let handle;
  if (automergeDocUrl !== undefined) {
    handle = repo.find(automergeDocUrl);
    await handle.doc();
    if (handle.docSync() === undefined) {
      console.error(`Could not find doc at ${automergeDocUrl}`);
      process.exit(1);
    }
  } else {
    handle = repo.create();
  }

  // const pack = loadPackageJson(dir);

  // if (!pack.type == "module") {
  //   console.error("must have a package.json of type: module");
  //   process.exit(1);
  // }

  handle.change((d: any) => {
    // Object.assign(d, pack);
    d.files = treeToPaths(directoryTree).map( p => p.substring(1)); // remove leading slash
    d.fileContents = directoryTree;
  });

  if (automergeDocUrl) {
    console.log(`Updated ${automergeDocUrl} with new contents.`);
  } else {
    console.log(`Created new doc at ${handle.url}`);
  }

  return handle.url;
}

// function loadPackageJson(dir) {
//   const packageJson = fs.readFileSync(path.join(dir, "package.json"), "utf8");
//   if (!packageJson) {
//     throw new Error(`Couldn't find package.json in ${dir}`);
//   }
//   return JSON.parse(packageJson);
// }

function treeToPaths(tree: Node, prefix = "") {
  const paths: string[] = [];

  Object.entries(tree).forEach(([name, node]) => {
    const path = `${prefix}/${name}`;

    if (node.contents) {
      paths.push(path);
    } else {
      paths.push(...treeToPaths(node, path));
    }
  });

  return paths;
}

type FileNode = {
  contentType: string,
  contents: string | Buffer | A.RawString,
};

type DirNode = { [entry: string]: Node };

type Node =
  | FileNode
  | DirNode;

function isFileNode(node: Node): node is FileNode {
  return 'contentType' in node;
}

function createNode(filePath: string): Node {
  const stats = fs.lstatSync(filePath);

  if (stats.isDirectory()) {
    const dirNode: DirNode = {};
    const files = fs.readdirSync(filePath);
    const filesNodes = files.map((file) => createNode(path.join(filePath, file)));

    files.forEach((file, index) => {
      dirNode[file] = filesNodes[index];
    });

    return dirNode;
  } else if (stats.isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const isBinary = isBinaryFileSync(filePath);
    const contentType = mime.lookup(ext) || "application/octet-stream";
    const contents = fs.readFileSync(filePath, isBinary ? null : "utf8");

    return {
      contentType,
      contents: isBinary ? contents : new A.RawString(contents as string),  // TODO: string vs buffer?
    };
  } else {
    throw new Error(`Unsupported file type at ${filePath}`);
  }
}
