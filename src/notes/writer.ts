import type { Timeline } from "../indexer/types.js";
import { extractMoments, type Moment } from "../engine/moments.js";
import { assign, computeStats, type Traits, type SheetStats } from "../engine/archetype.js";

const BANNED_WORDS = [
  "journey", "space", "wagmi", "to the moon",
  "revolutionary", "groundbreaking", "game-changing", "cutting-edge",
  "innovative", "best-in-class", "world-class", "state-of-the-art",
  "unparalleled", "unmatched", "unprecedented", "exciting", "thrilling"
];

export interface ValidationResult {
  valid: boolean;
  mismatches: string[];
  bannedHits: string[];
}

export function validateNotes(
  text: string,
  traits: Traits,
  moments: Moment[],
  stats: SheetStats
): ValidationResult {
  // Collect all valid numbers in the context
  const validNumbers = new Set<string>();
  
  // Basic stats
  validNumbers.add(String(traits.ageDays));
  validNumbers.add(String(traits.txCount));
  validNumbers.add(String(Math.floor(traits.ageDays / 365)));
  validNumbers.add(traits.valueMovedEth.toFixed(2));
  validNumbers.add(traits.valueMovedEth.toFixed(1));
  validNumbers.add(String(Math.floor(traits.valueMovedEth)));
  validNumbers.add(String(Math.round(traits.defiRatio * 100)));
  validNumbers.add(String(Math.round(traits.nftRatio * 100)));
  validNumbers.add(String(Math.round(traits.nightRatio * 100)));
  validNumbers.add(String(Math.round(traits.failRatio * 100)));
  validNumbers.add(String(Math.round(traits.cadenceRegularity * 100)));

  // Stat bars
  validNumbers.add(String(stats.conviction));
  validNumbers.add(String(stats.aggression));
  validNumbers.add(String(stats.vision));
  validNumbers.add(String(stats.endurance));
  validNumbers.add(String(stats.chaos));

  // Extract from moments
  for (const m of moments) {
    for (const match of m.headline.matchAll(/(\d[\d,.]*\d|\d)/g)) {
      const raw = match[1].replace(/,/g, "");
      validNumbers.add(raw);
    }
  }

  // Normalize comma-formatted numbers
  const normalized = text.replace(/(\d),(\d)/g, "$1$2");

  // Find all numbers in the text
  const found = [...normalized.matchAll(/\b(\d+\.?\d*)\b/g)].map((m) => m[1]);
  const mismatches: string[] = [];

  for (const n of found) {
    // Exclude years
    if (/^20[0-9]{2}$/.test(n)) continue;
    // Exclude trivial/generic numbers
    if (["0", "1", "2", "3", "4", "5", "100"].includes(n)) continue;
    // Check if the number is in the allowed set
    if (!validNumbers.has(n) && !validNumbers.has(String(Math.floor(Number(n))))) {
      mismatches.push(n);
    }
  }

  const bannedHits = BANNED_WORDS.filter((w) => text.toLowerCase().includes(w));

  return {
    valid: mismatches.length === 0 && bannedHits.length === 0,
    mismatches,
    bannedHits,
  };
}

export function generateFallbackNotes(
  archetypeId: string,
  traits: Traits,
  moments: Moment[]
): string {
  if (archetypeId === "unwritten") {
    return "This profile holds no history yet. The pages of their chronicle are blank, their sword unrefined, their legend unbegun. Connect, transact, and write your first entries onto the ledger.";
  }

  const ageYears = (traits.ageDays / 365).toFixed(1);
  const txs = traits.txCount;
  
  const genesis = moments.find((m) => m.type === "genesis");
  const genesisDate = genesis ? genesis.date : "the early days";

  switch (archetypeId) {
    case "wanderer": {
      const bear = moments.some((m) => m.type === "bear_survival") ? "held through market winters without selling" : "kept a steady pace";
      return `Forged in ${genesisDate}, this Wanderer has survived ${traits.ageDays} days on-chain. Across ${txs} actions, they ${bear}, choosing patience over daily noise. They remain a silent monument in a crowded arena.`;
    }
    case "trickster": {
      const nftPct = Math.round(traits.nftRatio * 100);
      return `This Trickster targets mints first, allocating ${nftPct}% of their transactions to NFTs. Active since ${genesisDate}, they sniper contract opportunities across a diverse footprint of ${txs} operations.`;
    }
    case "duelist": {
      const defiPct = Math.round(traits.defiRatio * 100);
      return `This Duelist navigates volatility with ${txs} transactions, dedicating ${defiPct}% to active DeFi contract calls. Active since ${genesisDate}, they confront market challenges head-on, seeking high-variance paths.`;
    }
    case "baron": {
      const vol = traits.valueMovedEth.toFixed(1);
      return `Moving ${vol} native value since ${genesisDate}, this Baron commands size. They prioritize capital flow and yield over trivial churn, deploying assets selectively across ${txs} total contract interactions.`;
    }
    case "oracle": {
      const failPct = (traits.failRatio * 100).toFixed(1);
      return `An early observer of ${ageYears} years, this Oracle acts only on clear signals. Boasting a fail rate of ${failPct}% over ${txs} total actions, they remain quiet, precise, and consistently ahead of the curve.`;
    }
    case "machine": {
      const regularity = Math.round(traits.cadenceRegularity * 100);
      const night = Math.round(traits.nightRatio * 100);
      return `Operating with ${regularity}% regular cadence, this Machine runs ${night}% of their ${txs} actions in night hours. Active since ${genesisDate}, they deploy contracts with automated, metronome precision.`;
    }
    default:
      return `A fighter with ${txs} transactions spanning ${ageYears} years since their first step in ${genesisDate}. They hold a unique profile on the ledger, awaiting their next dynamic evolution.`;
  }
}

async function callClaude(prompt: string): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 150,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { content: { type: string; text: string }[] };
  return data.content.find((c) => c.type === "text")?.text ?? "";
}

export async function writeNotes(
  address: string,
  archetypeId: string,
  traits: Traits,
  moments: Moment[],
  stats: SheetStats
): Promise<string> {
  if (archetypeId === "unwritten" || !process.env.ANTHROPIC_API_KEY) {
    return generateFallbackNotes(archetypeId, traits, moments);
  }

  const ageYears = (traits.ageDays / 365).toFixed(1);
  const momentsText = moments.map((m) => `- ${m.headline} (${m.date})`).join("\n");

  const basePrompt = `Write a character sheet personality note (40-70 words) for a Kaizenverse fighter forged from a crypto wallet:
Address: ${address}
Archetype: ${archetypeId.toUpperCase()}
Wallet age: ${ageYears} years (${traits.ageDays} days)
Total transactions: ${traits.txCount}
Computed stats: Conviction ${stats.conviction}, Aggression ${stats.aggression}, Vision ${stats.vision}, Endurance ${stats.endurance}, Chaos ${stats.chaos}

Extracted moments:
${momentsText}

RULES:
1. Length: strictly 40-70 words. Do not write a long paragraph.
2. Every number you write MUST be exact and appear in the stats, age, txCount, or moments above. Do not round or invent numbers.
3. Citations: explicitly cite at least one key moment (e.g. genesis date, holding streak, gas burned, etc.).
4. Do not use any of these banned words: ${BANNED_WORDS.join(", ")}.
5. Tone: specific, sober, anime-protagonist-focused, yet credit-analyst-accurate. No generic fluff.
`;

  let lastResponse = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const prompt = attempt === 1
        ? basePrompt
        : `${basePrompt}\n\nPREVIOUS RESPONSE REJECTED because:
${attempt > 1 ? `Validation issues found: ${JSON.stringify(validateNotes(lastResponse, traits, moments, stats))}` : ""}
Please rewrite complying strictly with the word count and number constraints.`;
      
      lastResponse = await callClaude(prompt);
      // Strip outer quotes if the LLM wrapped it
      lastResponse = lastResponse.replace(/^["']|["']$/g, "").trim();

      const check = validateNotes(lastResponse, traits, moments, stats);
      if (check.valid) {
        return lastResponse;
      }
      console.warn(`[notes:writer] Attempt ${attempt} validation failed. Mismatches: ${check.mismatches.join(", ")}, Banned: ${check.bannedHits.join(", ")}`);
    } catch (err) {
      console.error(`[notes:writer] Claude call failed on attempt ${attempt}:`, err);
    }
  }

  console.warn("[notes:writer] LLM generation failed or rejected. Using deterministic fallback.");
  return generateFallbackNotes(archetypeId, traits, moments);
}
