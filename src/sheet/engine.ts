import type { Timeline } from "../indexer/types.js";
import { extractMoments, type Moment } from "../engine/moments.js";
import { assign, computeStats, ARCHETYPES, type ArchetypeDef } from "../engine/archetype.js";
import type { CharacterSheet } from "./types.js";

const PROTOCOL_MAP: Record<string, string> = {
  // Mantle Mainnet (5000)
  "0x200811222472b53dbd9822a1062638a16ff42078": "Merchant Moe",
  "0x0cb13f64c12cdde6b4054a86c67d159a63ee42a5": "Mantle Treasury",
  "0xcda472997ddbf2cf1a95e0c5d6e2467d130a08e0": "Mantle LST",
  "0xd5f121f1c776b23700074a5be487201c1079dc9d": "Mantle LSP",
  
  // Ethereum Mainnet (1)
  "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9": "Aave",
  "0x3f5ce5fbfe3e9af3971dd833d26ba9b5c936f0be": "Uniswap",
  "0xef1c6e67703c7bd7107eed8303fbe6ec2554bf6b": "Uniswap",
  "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45": "Uniswap V3",
  "0xe592427a0d589705822506b1a8d01410c351e5aa": "Uniswap V3",
  "0x7a250d5630b4cf539739df2c5dacb4c659f2488d": "Uniswap V2",
  "0x0000000000005eb1b903b6e82862a98cc767ea30": "Seaport (OpenSea)",
  "0x9008d19f58aabd9ed0d60971565aa8510560ab41": "CoW Swap",
  "0xdef1c0ded9bec7f1a1670819833240f027b25eff": "0x Exchange",
  "0x881d97819ad50a8b548106d9b24bcfb7e3e9d8b7": "MetaMask Swaps",
};

export function getAffiliation(tl: Timeline): string {
  const ev = tl.events;
  const counts: Record<string, number> = {};
  for (const e of ev) {
    if (e.isContractCall && e.counterparty) {
      const addr = e.counterparty.toLowerCase();
      counts[addr] = (counts[addr] || 0) + 1;
    }
  }
  let bestAddr = "";
  let maxCount = 0;
  for (const [addr, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count;
      bestAddr = addr;
    }
  }
  if (!bestAddr) return "Independent";

  if (PROTOCOL_MAP[bestAddr]) {
    return PROTOCOL_MAP[bestAddr]!;
  }

  // Fallback to name inference from function calls
  const eventsToAddr = ev.filter(e => e.counterparty.toLowerCase() === bestAddr);
  const funcNames = eventsToAddr.map(e => e.functionName.toLowerCase()).filter(Boolean);
  if (funcNames.some(f => f.includes("swap") || f.includes("exactinput"))) return "Uniswap Ecosystem";
  if (funcNames.some(f => f.includes("mint") || f.includes("transfer"))) return "NFT Syndicate";
  if (funcNames.some(f => f.includes("stake") || f.includes("deposit") || f.includes("withdraw"))) return "Yield Guild";

  return `Faction ${bestAddr.slice(0, 10)}`;
}

export function buildCharacterSheet(
  tl: Timeline,
  personalityNotes: string
): CharacterSheet {
  const moments = extractMoments(tl);
  const assignment = assign(tl, moments);
  const stats = computeStats(assignment.traits);
  const affiliation = getAffiliation(tl);

  const ageYears = Number((assignment.traits.ageDays / 365).toFixed(1));

  return {
    address: tl.address,
    ageYears,
    heightTxs: assignment.traits.txCount,
    affiliation,
    role: assignment.archetype.name,
    stats,
    personality: personalityNotes,
    archetype: assignment.archetype,
    evidence: assignment.evidence,
    moments,
    version: assignment.version,
  };
}
