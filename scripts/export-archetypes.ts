/** Export the published archetype mapping to archetypes.json and print its keccak256.
 * This hash is pinned in Relic.sol at deploy — change the rules, change the hash, publicly. */
import { writeFileSync } from "node:fs";
import { keccak256, toBytes } from "viem";
import { ARCHETYPES, ARCHETYPES_VERSION, TIE_BREAK } from "../src/engine/archetype.js";

const mapping = {
  version: ARCHETYPES_VERSION,
  tieBreak: TIE_BREAK,
  archetypes: ARCHETYPES,
  rules: {
    unwritten: "events < 3",
    wanderer: "+2 age>=730d · +1 0<tx/mo<=8 · +2 bear survivor · +1 diamond hands",
    trickster: "+3 nftRatio>=0.25 (else +1.5 if >=0.12) · +1 contractDiversity>=0.35",
    duelist: "+2.5 defiRatio>=0.4 (else +1 if >=0.2) · +1.5 tx/mo>=20",
    baron: "+3 valueMoved>=50 native (else +1.5 if >=5) · +1 defiRatio>=0.25 & tx/mo<20",
    oracle: "+2 age>=1095d · +1 failRatio<=0.02 · +1.5 tx/mo<=4",
    machine: "+2.5 cadenceRegularity>=0.6 · +1.5 nightRatio>=0.35 · +2 deployedContract · +1 tx/mo>=60",
    winner: "max score; ties resolved by tieBreak order",
  },
} as const;

const json = JSON.stringify(mapping, null, 2) + "\n";
writeFileSync("archetypes.json", json);
console.log("archetypes.json written");
console.log("keccak256:", keccak256(toBytes(json)));
