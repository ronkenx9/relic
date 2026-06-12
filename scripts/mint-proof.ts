/** Forge a real wallet's sheet from the committed snapshot and mint it on Relic.sol —
 * the AI-pipeline output written on-chain (deployment-award proof).
 * Env: DEPLOYER_PRIVATE_KEY (forge key), RELIC_ADDRESS. */
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, keccak256, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mantleSepolia } from "../src/chains.js";
import { extractMoments } from "../src/engine/moments.js";
import { assign, computeStats } from "../src/engine/archetype.js";
import { generateLevel } from "../src/engine/levelgen.js";

const SUBJECT = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"; // vitalik — demo snapshot
const RELIC = (process.env.RELIC_ADDRESS ?? "0x903cfd9F9F315301A80ad6A1D85da0F2E081b1a4") as `0x${string}`;

const ABI = [
  { type: "function", name: "mintRelic", stateMutability: "nonpayable",
    inputs: [{ name: "to", type: "address" }, { name: "subject", type: "address" },
             { name: "sheetHash", type: "bytes32" }, { name: "uri", type: "string" }],
    outputs: [{ name: "tokenId", type: "uint256" }] },
  { type: "function", name: "relicOf", stateMutability: "view",
    inputs: [{ name: "", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "sheetHashOf", stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }], outputs: [{ name: "", type: "bytes32" }] },
] as const;

async function main() {
  const tl = JSON.parse(readFileSync(`frontend/demo/${SUBJECT.toLowerCase()}.json`, "utf8"));
  const moments = extractMoments(tl);
  const a = assign(tl, moments);
  const level = generateLevel(tl, moments);

  // canonical sheet — what the game derives, hashed verbatim
  const sheet = {
    subject: SUBJECT.toLowerCase(),
    archetype: a.archetype.id,
    archetypeVersion: a.version,
    stats: computeStats(a.traits),
    evidence: a.evidence,
    moments: moments.map((m) => ({ type: m.type, date: m.date, headline: m.headline, evidence: m.evidence })),
    levelSeed: level.seed,
    snapshotAt: tl.fetchedAt,
  };
  const sheetJson = JSON.stringify(sheet);
  const sheetHash = keccak256(toBytes(sheetJson));
  console.log(`sheet: ${a.archetype.name}, ${moments.length} moments, seed ${level.seed}`);
  console.log(`sheetHash: ${sheetHash}`);

  const account = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`);
  const wallet = createWalletClient({ account, chain: mantleSepolia, transport: http() });
  const pub = createPublicClient({ chain: mantleSepolia, transport: http() });

  const hash = await wallet.writeContract({
    address: RELIC, abi: ABI, functionName: "mintRelic",
    args: [account.address, SUBJECT as `0x${string}`, sheetHash, "https://ronkenx9.github.io/relic/"],
  });
  console.log("mint tx:", hash);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  console.log("status:", receipt.status, "block:", receipt.blockNumber);

  const tokenId = await pub.readContract({ address: RELIC, abi: ABI, functionName: "relicOf", args: [SUBJECT as `0x${string}`] });
  const onChain = await pub.readContract({ address: RELIC, abi: ABI, functionName: "sheetHashOf", args: [tokenId] });
  console.log(`token #${tokenId} sheetHash on-chain: ${onChain}`);
  console.log("match:", onChain === sheetHash);
}
main();
