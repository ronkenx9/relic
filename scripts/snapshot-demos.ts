/** Snapshot the demo wallets' timelines into frontend/demo/ (R6: the demo never
 * depends on third-party uptime). Re-run any time to refresh. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fetchTimeline } from "../src/engine/explorer.js";

const DEMOS = [
  "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", // vitalik
  "0x0168459886bd2aa322c18ed0b209887095afcacb", // an og — 8.7y of history
  "0x561a8431b23fe6a524ce874a029cdaadc9642bf4", // a degen — 4.3y, 1200+ events
];

async function main() {
  const dir = join(process.cwd(), "frontend", "demo");
  await mkdir(dir, { recursive: true });
  for (const addr of DEMOS) {
    process.stdout.write(`${addr} … `);
    const tl = await fetchTimeline(addr as `0x${string}`);
    await writeFile(join(dir, `${addr.toLowerCase()}.json`), JSON.stringify(tl));
    console.log(`${tl.events.length} events${tl.truncated ? " (truncated)" : ""}`);
  }
}
main();
