import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Timeline } from "../src/indexer/types.js";
import { buildCharacterSheet } from "../src/sheet/engine.js";
import { generateFallbackNotes } from "../src/notes/writer.js";
import { assign } from "../src/engine/archetype.js";
import { extractMoments } from "../src/engine/moments.js";

async function main() {
  const dir = join(process.cwd(), "data", "calibration");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  
  if (files.length === 0) {
    console.error("No calibration files found. Run scripts/pull-calibration.ts first.");
    process.exit(1);
  }

  console.log(`Analyzing ${files.length} calibration sheets...\n`);
  
  const assignments: Record<string, number> = {};
  const sheets = [];

  for (const file of files) {
    const filePath = join(dir, file);
    const content = await readFile(filePath, "utf8");
    const tl = JSON.parse(content) as Timeline;

    const moments = extractMoments(tl);
    const a = assign(tl, moments);
    const notes = generateFallbackNotes(a.archetype.id, a.traits, moments);
    const sheet = buildCharacterSheet(tl, notes);

    assignments[sheet.role] = (assignments[sheet.role] || 0) + 1;
    sheets.push(sheet);

    console.log(`Address:     ${sheet.address}`);
    console.log(`Archetype:   ${sheet.role} (${sheet.archetype.tagline})`);
    console.log(`Age/Height:  ${sheet.ageYears} years, ${sheet.heightTxs} txs`);
    console.log(`Affiliated:  ${sheet.affiliation}`);
    console.log(`Stats:       Conviction:${sheet.stats.conviction} Aggression:${sheet.stats.aggression} Vision:${sheet.stats.vision} Endurance:${sheet.stats.endurance} Chaos:${sheet.stats.chaos}`);
    console.log(`Notes:       ${sheet.personality}`);
    console.log(`Evidence:    ${sheet.evidence.join(" | ")}`);
    console.log("-".repeat(80));
  }

  console.log("\n========================================================");
  console.log("CALIBRATION ARCHETYPE DISTRIBUTION");
  console.log("========================================================");
  for (const [role, count] of Object.entries(assignments)) {
    console.log(`${role.padEnd(25)}: ${count}`);
  }
  console.log("========================================================");

  // Assert that sheets are different
  const uniquePersonalities = new Set(sheets.map((s) => s.personality));
  const uniqueRoles = new Set(sheets.map((s) => s.role));
  
  console.log(`Unique Roles:         ${uniqueRoles.size}`);
  console.log(`Unique Personalities: ${uniquePersonalities.size}`);
  
  if (uniquePersonalities.size === sheets.length) {
    console.log("\n✅ CALIBRATION PASSED: All 10 character sheets are unique and distinct.");
  } else {
    console.log("\n❌ CALIBRATION FAILED: Some character sheets returned identical descriptions.");
    process.exit(1);
  }
}

main().catch(console.error);
