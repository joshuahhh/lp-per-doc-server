import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import { pushToAutomerge } from "./pushToAutomerge.js";
import { Repo } from "@automerge/automerge-repo";

export async function cliMain() {
  const dir = process.argv[2];
  const syncServerUrl = "wss://sync.automerge.org";
  const test = false;

  /* just an aside to myself but this stuff above is kind of gross and i should fix it */
  const repo = new Repo({
    network: test ? [] : [new BrowserWebSocketClientAdapter(syncServerUrl)],
  });

  const url = await pushToAutomerge({ repo, dir });

  console.log("Pushed to Automerge doc at", url);

  console.log("Waiting for changes to sync...");
  // TODO: we need a better mechanism for this
  await new Promise((resolve) => setTimeout(resolve, 500000));

  process.exit(0);
}
