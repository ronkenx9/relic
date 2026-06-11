/** Moment extractor — pure functions over a Timeline (PRD §3).
 * Every moment carries evidence txHashes. No evidence, no moment. Browser-safe. */
import type { Timeline, TimelineEvent } from "../indexer/types.js";

export type MomentType =
  | "genesis"
  | "first_nft"
  | "first_defi"
  | "bear_survival"
  | "gas_burned"
  | "quiet_year"
  | "degen_era"
  | "diamond_era"
  | "full_exit" // bought it all, sold it all — "the one you let go" (no price claim: R2)
  | "faceplant"; // failed transactions — chaos fuel

export interface Moment {
  type: MomentType;
  date: string; // ISO yyyy-mm-dd of the anchor event
  headline: string; // short factual line, numbers included
  evidence: { txHashes: string[]; detail: string };
  severity: number; // 0..1 — drives trap intensity in the level generator
}

const DAY = 86400;
const iso = (ts: number) => new Date(ts * 1000).toISOString().slice(0, 10);

/** Known market drawdown windows (public history; held-through = survival). */
export const BEAR_WINDOWS = [
  { name: "the 2022 collapse", from: Date.UTC(2022, 4, 1) / 1000, to: Date.UTC(2022, 11, 31) / 1000 },
  { name: "the 2021 May crash", from: Date.UTC(2021, 4, 10) / 1000, to: Date.UTC(2021, 6, 20) / 1000 },
] as const;

const DEFI_HINTS = ["swap", "addliquidity", "removeliquidity", "deposit", "withdraw", "stake", "borrow", "repay", "supply", "claim", "harvest", "mintnft", "multicall", "exactinput", "exactoutput"];

export function extractMoments(tl: Timeline): Moment[] {
  const ev = tl.events;
  if (ev.length === 0) return [];
  const moments: Moment[] = [];
  const first = ev[0]!;

  // 1. Genesis — first event ever
  moments.push({
    type: "genesis",
    date: iso(first.timestamp),
    headline: `First on-chain step: ${iso(first.timestamp)}`,
    evidence: { txHashes: [first.hash], detail: `first recorded event (chain ${first.chainId})` },
    severity: 0.1,
  });

  // 2. First NFT
  const nft = ev.find((e) => e.kind === "nft_transfer");
  if (nft) {
    moments.push({
      type: "first_nft",
      date: iso(nft.timestamp),
      headline: `First NFT: ${nft.token?.symbol ?? "?"} on ${iso(nft.timestamp)}`,
      evidence: { txHashes: [nft.hash], detail: `first ERC-721 transfer (${nft.token?.symbol ?? "?"})` },
      severity: 0.15,
    });
  }

  // 3. First DeFi touch — first contract call whose method smells like DeFi
  const defi = ev.find(
    (e) => e.isContractCall && DEFI_HINTS.some((h) => e.functionName.toLowerCase().includes(h)),
  );
  if (defi) {
    moments.push({
      type: "first_defi",
      date: iso(defi.timestamp),
      headline: `First DeFi touch: ${defi.functionName || "contract call"} on ${iso(defi.timestamp)}`,
      evidence: { txHashes: [defi.hash], detail: `method ${defi.functionName || "(raw call)"}` },
      severity: 0.2,
    });
  }

  // 4. Bear survival — existed before a bear window, no outgoing transfers during it,
  //    and alive after it (any event later).
  for (const w of BEAR_WINDOWS) {
    const before = ev.some((e) => e.timestamp < w.from);
    const after = ev.some((e) => e.timestamp > w.to);
    const soldDuring = ev.some(
      (e) => e.direction === "out" && e.kind !== "tx" && e.timestamp >= w.from && e.timestamp <= w.to,
    );
    if (before && after && !soldDuring) {
      const anchor = ev.filter((e) => e.timestamp < w.from).at(-1)!;
      moments.push({
        type: "bear_survival",
        date: iso(w.from),
        headline: `Held through ${w.name} without selling`,
        evidence: { txHashes: [anchor.hash], detail: `no outgoing token transfers ${iso(w.from)}–${iso(w.to)}` },
        severity: 0.7,
      });
      break; // one survival story is enough
    }
  }

  // 5. Gas burned — lifetime gas total (lower bound when truncated)
  const gasWei = ev.reduce((acc, e) => acc + BigInt(e.gasCostWei || "0"), 0n);
  if (gasWei > 0n) {
    const eth = Number(gasWei / 10n ** 12n) / 1e6; // 6dp
    const payer = ev.filter((e) => e.gasCostWei !== "0");
    moments.push({
      type: "gas_burned",
      date: iso(payer.at(-1)!.timestamp),
      headline: `${eth.toFixed(4)} native burned as gas across ${payer.length} txs${tl.truncated ? " (at least)" : ""}`,
      evidence: { txHashes: payer.slice(-3).map((e) => e.hash), detail: `sum of gasUsed*gasPrice on outgoing txs` },
      severity: Math.min(1, payer.length / 200),
    });
  }

  // 6. Quiet year — longest dormancy gap ≥ 180 days
  let gap = { len: 0, from: 0, to: 0, hash: "" };
  for (let i = 1; i < ev.length; i++) {
    const len = ev[i]!.timestamp - ev[i - 1]!.timestamp;
    if (len > gap.len) gap = { len, from: ev[i - 1]!.timestamp, to: ev[i]!.timestamp, hash: ev[i]!.hash };
  }
  if (gap.len >= 180 * DAY) {
    moments.push({
      type: "quiet_year",
      date: iso(gap.from),
      headline: `Went silent for ${Math.floor(gap.len / DAY)} days (${iso(gap.from)} → ${iso(gap.to)})`,
      evidence: { txHashes: [gap.hash], detail: "longest gap between consecutive events" },
      severity: Math.min(1, gap.len / (720 * DAY)),
    });
  }

  // 7. Degen era — busiest 30-day window (≥ 20 events)
  let best = { count: 0, start: 0 };
  let j = 0;
  for (let i = 0; i < ev.length; i++) {
    while (ev[i]!.timestamp - ev[j]!.timestamp > 30 * DAY) j++;
    if (i - j + 1 > best.count) best = { count: i - j + 1, start: ev[j]!.timestamp };
  }
  if (best.count >= 20) {
    const windowEvents = ev.filter((e) => e.timestamp >= best.start && e.timestamp <= best.start + 30 * DAY);
    moments.push({
      type: "degen_era",
      date: iso(best.start),
      headline: `${best.count} moves in 30 days starting ${iso(best.start)}`,
      evidence: { txHashes: windowEvents.slice(0, 3).map((e) => e.hash), detail: "busiest 30-day window" },
      severity: Math.min(1, best.count / 100),
    });
  }

  // 8. Diamond era — token held (in, never out) for ≥ 365 days and still held at last event
  const lastTs = ev.at(-1)!.timestamp;
  const byToken = new Map<string, { in: TimelineEvent[]; out: TimelineEvent[] }>();
  for (const e of ev) {
    if (e.kind !== "token_transfer" || !e.token) continue;
    const k = `${e.chainId}:${e.token.address}`;
    const rec = byToken.get(k) ?? { in: [], out: [] };
    rec[e.direction === "in" ? "in" : "out"].push(e);
    byToken.set(k, rec);
  }
  let diamond: { sym: string; days: number; hash: string; ts: number } | null = null;
  for (const rec of byToken.values()) {
    if (rec.in.length === 0 || rec.out.length > 0) continue;
    const firstIn = rec.in[0]!;
    const days = Math.floor((lastTs - firstIn.timestamp) / DAY);
    if (days >= 365 && (!diamond || days > diamond.days)) {
      diamond = { sym: firstIn.token!.symbol, days, hash: firstIn.hash, ts: firstIn.timestamp };
    }
  }
  if (diamond) {
    moments.push({
      type: "diamond_era",
      date: iso(diamond.ts),
      headline: `Still holding ${diamond.sym} after ${diamond.days} days — never sold a single one`,
      evidence: { txHashes: [diamond.hash], detail: `inbound ${diamond.sym}, zero outbound transfers since` },
      severity: Math.min(1, diamond.days / 1500),
    });
  }

  // 9. Full exit — token that came in and was completely sent away (the one you let go).
  //    NOTE: we make NO price claim ("later 5x'd" needs sourced prices we don't have — R2).
  let exit: { sym: string; hashIn: string; hashOut: string; ts: number } | null = null;
  for (const rec of byToken.values()) {
    if (rec.in.length === 0 || rec.out.length === 0) continue;
    const lastOut = rec.out.at(-1)!;
    const laterIn = rec.in.some((e) => e.timestamp > lastOut.timestamp);
    if (!laterIn && (!exit || lastOut.timestamp > exit.ts)) {
      exit = { sym: lastOut.token!.symbol, hashIn: rec.in[0]!.hash, hashOut: lastOut.hash, ts: lastOut.timestamp };
    }
  }
  if (exit) {
    moments.push({
      type: "full_exit",
      date: iso(exit.ts),
      headline: `Let go of every last ${exit.sym} on ${iso(exit.ts)}`,
      evidence: { txHashes: [exit.hashIn, exit.hashOut], detail: "token fully exited; no re-entry" },
      severity: 0.4,
    });
  }

  // 10. Faceplants — failed transactions (gas paid for nothing)
  const fails = ev.filter((e) => e.failed);
  if (fails.length > 0) {
    moments.push({
      type: "faceplant",
      date: iso(fails.at(-1)!.timestamp),
      headline: `${fails.length} transaction${fails.length > 1 ? "s" : ""} failed — gas paid for nothing`,
      evidence: { txHashes: fails.slice(-3).map((e) => e.hash), detail: "isError=1 transactions" },
      severity: Math.min(1, fails.length / 20),
    });
  }

  return moments;
}
