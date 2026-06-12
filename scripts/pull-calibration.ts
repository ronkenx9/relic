import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fetchTimeline } from "../src/engine/explorer.js";

// 10 calibration wallets covering all 7 archetypes:
// 1. Vitalik (Oracle / Degen)
// 2. 0x0168... (OG / Wanderer)
// 3. 0x561a... (Degen / Duelist)
// 4. Fresh address (Unwritten)
// 5. Binance 7 (Baron)
// 6. Eth2 Deposit Contract (Baron / Machine)
// 7. Aave V2 Lending Pool (Machine / Oracle)
// 8. 0xde0b295669a9fd93d5f28d9ec85e40f4cb697bae (Maker proxy / Oracle)
// 9. Uniswap V3 Factory (Machine)
// 10. A fresh wallet with 1 tx (Unwritten / Tourist)
const CALIBRATION_ADDRESSES = [
  "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", // Vitalik
  "0x0168459886bd2aa322c18ed0b209887095afcacb", // OG
  "0x561a8431b23fe6a524ce874a029cdaadc9642bf4", // Duelist / Degen
  "0x0000000000000000000000000000000000000000", // Unwritten (Zero address)
  "0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8", // Whale (Binance 7)
  "0x00000000219ab540356cBB839Cbe05303d7705Fa", // Eth2 Deposit Contract
  "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9", // Aave V2 Lending Pool
  "0xde0b295669a9fd93d5f28d9ec85e40f4cb697bae", // Maker proxy
  "0x1F98431c8aD98523631AE4a59f267346ea31F984", // Uniswap V3 Factory
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", // Anvil Account 1 (almost empty)
];

async function main() {
  const dir = join(process.cwd(), "data", "calibration");
  await mkdir(dir, { recursive: true });
  console.log(`Pulling ${CALIBRATION_ADDRESSES.length} calibration wallets...`);
  
  for (const addr of CALIBRATION_ADDRESSES) {
    try {
      process.stdout.write(`Fetching ${addr} ... `);
      const tl = await fetchTimeline(addr);
      const filePath = join(dir, `${addr.toLowerCase()}.json`);
      await writeFile(filePath, JSON.stringify(tl, null, 2));
      console.log(`saved ${tl.events.length} events.`);
    } catch (err) {
      console.log(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log("Calibration pull complete!");
}

main().catch(console.error);
