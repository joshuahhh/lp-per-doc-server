import { next as A } from "@automerge/automerge";
import { AnyDocumentId, AutomergeUrl, DocHandle, Repo } from "@automerge/automerge-repo";
import fs from "fs";
import { isBinaryFileSync } from "isbinaryfile";
import mime from "mime-types";
import path from "path";
import process from "process";


export async function pushToAutomerge(opts: {
  repo: Repo,
  dir: string,
  automergeDocUrl?: AnyDocumentId,
  ignorePath?: (path: string) => boolean,
}): Promise<AutomergeUrl> {
  const { repo, dir, automergeDocUrl, ignorePath } = opts;

  let handle: DocHandle<Node>;
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

  const node = createNode(dir, ignorePath);

  handle.change((d: Node) => {
    Object.assign(d, node);
  });

  return handle.url;
}

type Node =
  | FileNode
  | DirNode;

type FileNode = {
  contentType: string,
  contents: string | Buffer | A.RawString,
};

type DirNode = { [entry: string]: Node };

function createNode(filePath: string, ignorePath?: (path: string) => boolean): Node {
  const stats = fs.lstatSync(filePath);

  if (stats.isDirectory()) {
    const result: DirNode = {};
    const children = fs.readdirSync(filePath);
    for (const child of children) {
      const childPath = path.join(filePath, child);
      if (ignorePath && ignorePath(childPath)) { continue; }
      result[child] = createNode(childPath, ignorePath);
    }
    return result;
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
