/** Archetype engine — deterministic trait vector → one of 6 Kaizenverse variants
 * (+ THE UNWRITTEN for near-empty wallets). Published mapping, evidence printed.
 * No LLM anywhere in this decision (PRD §4). Browser-safe. */
import type { Timeline } from "../indexer/types.js";
import type { Moment } from "./moments.js";

export const ARCHETYPES_VERSION = "1.0.0";

export type ArchetypeId =
  | "wanderer"
  | "trickster"
  | "duelist"
  | "baron"
  | "oracle"
  | "machine"
  | "unwritten";

export interface ArchetypeDef {
  id: ArchetypeId;
  name: string;
  tagline: string;
  /** Voxel palette (body/trim/glow) — used by the sheet AND the procedural game fighter. */
  palette: { body: string; trim: string; glow: string };
}

/** Published canon (working names — owner may rename to Kaizenverse lore). */
export const ARCHETYPES: Record<ArchetypeId, ArchetypeDef> = {
  wanderer: { id: "wanderer", name: "THE WANDERER", tagline: "Old roads. Long holds. Still here.", palette: { body: "#3E6B58", trim: "#EDE9E0", glow: "#7CC79B" } },
  trickster: { id: "trickster", name: "THE TRICKSTER", tagline: "Mints first, reads later.", palette: { body: "#7B4FA6", trim: "#F2E9FF", glow: "#C99BFF" } },
  duelist: { id: "duelist", name: "THE DUELIST", tagline: "Every chart is a challenge.", palette: { body: "#A6342E", trim: "#FFE9E6", glow: "#FF7A6E" } },
  baron: { id: "baron", name: "THE BARON", tagline: "Size talks. Yield walks.", palette: { body: "#8C6D1F", trim: "#FFF6DC", glow: "#E3A52F" } },
  oracle: { id: "oracle", name: "THE ORACLE", tagline: "Early. Quiet. Right.", palette: { body: "#27557A", trim: "#E6F2FF", glow: "#6EC1FF" } },
  machine: { id: "machine", name: "THE MACHINE", tagline: "No sleep. No tilt. No mercy.", palette: { body: "#444B52", trim: "#E8EBEE", glow: "#FF3B30" } },
  unwritten: { id: "unwritten", name: "THE UNWRITTEN", tagline: "Your story hasn't started. Mint page one.", palette: { body: "#2A2A2E", trim: "#BFBFC4", glow: "#FFFFFF" } },
};

/** Tie-break order — published and versioned (PRD §4). */
export const TIE_BREAK: ArchetypeId[] = ["machine", "baron", "oracle", "trickster", "duelist", "wanderer"];

export interface Traits {
  ageDays: number;
  txCount: number;
  txPerMonth: number;
  nftRatio: number; // nft transfers / all events
  defiRatio: number; // defi-ish contract calls / txs
  contractDiversity: number; // unique counterparties / events
  nightRatio: number; // 00:00–05:59 UTC activity share
  failRatio: number;
  bearSurvivor: boolean;
  diamondHands: boolean;
  deployedContract: boolean;
  cadenceRegularity: number; // 0..1 — how machine-like the gaps between txs are
  valueMovedEth: number; // native moved, both directions, in native units
}

export interface Assignment {
  archetype: ArchetypeDef;
  traits: Traits;
  scores: Record<ArchetypeId, number>;
  /** WHY — concrete numbers + evidence, printed on the sheet (kill condition #2). */
  evidence: string[];
  version: string;
}

const DAY = 86400;

export function computeTraits(tl: Timeline, moments: Moment[]): Traits {
  const ev = tl.events;
  const txs = ev.filter((e) => e.kind === "tx");
  const n = ev.length || 1;
  const ageDays = ev.length ? Math.max(1, Math.floor((ev.at(-1)!.timestamp - ev[0]!.timestamp) / DAY)) : 0;
  const counterparties = new Set(ev.map((e) => e.counterparty).filter(Boolean));
  const night = ev.filter((e) => new Date(e.timestamp * 1000).getUTCHours() < 6);
  const defiHits = txs.filter((e) => e.isContractCall && e.functionName !== "");

  // cadence regularity: coefficient of variation of inter-tx gaps, inverted to 0..1
  let cadence = 0;
  if (txs.length >= 8) {
    const gaps: number[] = [];
    for (let i = 1; i < txs.length; i++) gaps.push(txs[i]!.timestamp - txs[i - 1]!.timestamp);
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const sd = Math.sqrt(gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length);
    const cv = mean > 0 ? sd / mean : 9;
    cadence = Math.max(0, Math.min(1, 1.4 - cv / 2)); // cv 0 → 1.0 (metronome), cv ≥ 2.8 → 0
  }

  const valueWei = ev
    .filter((e) => e.kind === "tx")
    .reduce((acc, e) => acc + BigInt(e.value || "0"), 0n);

  return {
    ageDays,
    txCount: txs.length,
    txPerMonth: ageDays ? (txs.length / ageDays) * 30 : 0,
    nftRatio: ev.filter((e) => e.kind === "nft_transfer").length / n,
    defiRatio: txs.length ? defiHits.length / txs.length : 0,
    contractDiversity: counterparties.size / n,
    nightRatio: night.length / n,
    failRatio: txs.length ? txs.filter((e) => e.failed).length / txs.length : 0,
    bearSurvivor: moments.some((m) => m.type === "bear_survival"),
    diamondHands: moments.some((m) => m.type === "diamond_era"),
    deployedContract: txs.some((e) => !e.counterparty && e.isContractCall),
    cadenceRegularity: cadence,
    valueMovedEth: Number(valueWei / 10n ** 14n) / 1e4,
  };
}

/** Published scoring — each rule contributes points; max wins; TIE_BREAK settles draws. */
export function assign(tl: Timeline, moments: Moment[]): Assignment {
  const t = computeTraits(tl, moments);
  const evidence: string[] = [];

  if (tl.events.length < 3) {
    return {
      archetype: ARCHETYPES.unwritten,
      traits: t,
      scores: { wanderer: 0, trickster: 0, duelist: 0, baron: 0, oracle: 0, machine: 0, unwritten: 1 },
      evidence: [`only ${tl.events.length} on-chain events — the page is blank`],
      version: ARCHETYPES_VERSION,
    };
  }

  const s: Record<ArchetypeId, number> = { wanderer: 0, trickster: 0, duelist: 0, baron: 0, oracle: 0, machine: 0, unwritten: 0 };

  // WANDERER: old, slow, holds, survives
  if (t.ageDays >= 730) s.wanderer += 2;
  if (t.txPerMonth > 0 && t.txPerMonth <= 8) s.wanderer += 1;
  if (t.bearSurvivor) s.wanderer += 2;
  if (t.diamondHands) s.wanderer += 1;

  // TRICKSTER: NFT-heavy, diverse contracts
  if (t.nftRatio >= 0.25) s.trickster += 3;
  else if (t.nftRatio >= 0.12) s.trickster += 1.5;
  if (t.contractDiversity >= 0.35) s.trickster += 1;

  // DUELIST: DEX-heavy churner
  if (t.defiRatio >= 0.4) s.duelist += 2.5;
  else if (t.defiRatio >= 0.2) s.duelist += 1;
  if (t.txPerMonth >= 20) s.duelist += 1.5;

  // BARON: size + yield posture
  if (t.valueMovedEth >= 50) s.baron += 3;
  else if (t.valueMovedEth >= 5) s.baron += 1.5;
  if (t.defiRatio >= 0.25 && t.txPerMonth < 20) s.baron += 1;

  // ORACLE: old + precise + quiet
  if (t.ageDays >= 1095) s.oracle += 2;
  if (t.failRatio <= 0.02) s.oracle += 1;
  if (t.txPerMonth <= 4) s.oracle += 1.5;

  // MACHINE: cadence, night grind, deployer
  if (t.cadenceRegularity >= 0.6) s.machine += 2.5;
  if (t.nightRatio >= 0.35) s.machine += 1.5;
  if (t.deployedContract) s.machine += 2;
  if (t.txPerMonth >= 60) s.machine += 1;

  let winner: ArchetypeId = TIE_BREAK[TIE_BREAK.length - 1]!;
  let bestScore = -1;
  for (const id of TIE_BREAK) {
    if (s[id] > bestScore) { bestScore = s[id]; winner = id; }
  }

  // evidence lines — concrete, numeric, tx-anchored where possible
  evidence.push(`wallet age ${(t.ageDays / 365).toFixed(1)}y · ${t.txCount} txs · ${t.txPerMonth.toFixed(1)} tx/mo`);
  if (winner === "wanderer" && t.bearSurvivor) {
    const m = moments.find((mm) => mm.type === "bear_survival")!;
    evidence.push(`${m.headline} (tx ${m.evidence.txHashes[0]!.slice(0, 10)}…)`);
  }
  if (winner === "trickster") evidence.push(`${(t.nftRatio * 100).toFixed(0)}% of activity is NFTs`);
  if (winner === "duelist") evidence.push(`${(t.defiRatio * 100).toFixed(0)}% of txs are DeFi calls`);
  if (winner === "baron") evidence.push(`${t.valueMovedEth.toFixed(2)} native moved lifetime`);
  if (winner === "oracle") evidence.push(`fail rate ${(t.failRatio * 100).toFixed(1)}% — quiet and precise`);
  if (winner === "machine") evidence.push(`cadence regularity ${(t.cadenceRegularity * 100).toFixed(0)}% · ${(t.nightRatio * 100).toFixed(0)}% night moves`);
  if (t.diamondHands) {
    const m = moments.find((mm) => mm.type === "diamond_era")!;
    evidence.push(m.headline);
  }

  return { archetype: ARCHETYPES[winner], traits: t, scores: s, evidence, version: ARCHETYPES_VERSION };
}

/** Five sheet stats, 0–100 (PRD §5) — also drive the fighter's feel in the game. */
export interface SheetStats { conviction: number; aggression: number; vision: number; endurance: number; chaos: number }

export function computeStats(t: Traits): SheetStats {
  const clamp = (x: number) => Math.max(2, Math.min(100, Math.round(x)));
  return {
    conviction: clamp((t.diamondHands ? 55 : 0) + (t.bearSurvivor ? 30 : 0) + Math.min(15, t.ageDays / 73)),
    aggression: clamp(t.txPerMonth * 2.2 + t.defiRatio * 30),
    vision: clamp(t.ageDays / 14 + (t.failRatio <= 0.02 ? 25 : 0)),
    endurance: clamp((t.bearSurvivor ? 50 : 0) + Math.min(50, t.ageDays / 29)),
    chaos: clamp(t.failRatio * 300 + t.nightRatio * 80),
  };
}
