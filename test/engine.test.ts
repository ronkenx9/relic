import { describe, expect, it } from "vitest";
import { hashSeed, makeRng } from "../src/engine/rng.js";
import { extractMoments, BEAR_WINDOWS } from "../src/engine/moments.js";
import { assign, computeStats, computeTraits, ARCHETYPES_VERSION, TIE_BREAK } from "../src/engine/archetype.js";
import { generateLevel } from "../src/engine/levelgen.js";
import { sortEvents, type Timeline, type TimelineEvent } from "../src/indexer/types.js";

const T0 = Date.UTC(2019, 2, 11) / 1000; // 2019-03-11
const DAY = 86400;

function ev(partial: Partial<TimelineEvent>, i: number): TimelineEvent {
  return {
    chainId: 5000,
    hash: `0x${(i + 1).toString(16).padStart(64, "a")}`,
    timestamp: T0 + i * DAY,
    blockNumber: 1000 + i,
    kind: "tx",
    direction: "out",
    counterparty: "0xcafe",
    value: "0",
    functionName: "",
    isContractCall: false,
    failed: false,
    gasUsed: "21000",
    gasCostWei: "21000000000000",
    ...partial,
  };
}

function timeline(events: TimelineEvent[], address = "0x1234"): Timeline {
  return { address, fetchedAt: 0, chains: [5000], events: sortEvents(events), truncated: false };
}

describe("rng", () => {
  it("is deterministic per address and differs across addresses", () => {
    const a = makeRng(hashSeed("0xABC"));
    const b = makeRng(hashSeed("0xabc")); // case-insensitive
    const c = makeRng(hashSeed("0xdef"));
    const seqA = [a.next(), a.next(), a.next()];
    const seqB = [b.next(), b.next(), b.next()];
    const seqC = [c.next(), c.next(), c.next()];
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
  });
});

describe("moment extractor", () => {
  it("finds genesis + gas on any non-empty wallet", () => {
    const m = extractMoments(timeline([ev({}, 0), ev({}, 1)]));
    expect(m.map((x) => x.type)).toContain("genesis");
    expect(m.map((x) => x.type)).toContain("gas_burned");
    for (const mm of m) expect(mm.evidence.txHashes.length).toBeGreaterThan(0);
  });

  it("finds first_nft and first_defi", () => {
    const m = extractMoments(
      timeline([
        ev({}, 0),
        ev({ kind: "nft_transfer", direction: "in", token: { address: "0xn", symbol: "KAI", decimals: 0, tokenId: "7" } }, 1),
        ev({ isContractCall: true, functionName: "swapExactInput" }, 2),
      ]),
    );
    const types = m.map((x) => x.type);
    expect(types).toContain("first_nft");
    expect(types).toContain("first_defi");
  });

  it("finds bear_survival only when held through a window", () => {
    const w = BEAR_WINDOWS[0];
    const survivor = extractMoments(
      timeline([
        ev({ timestamp: w.from - 90 * DAY }, 0),
        ev({ timestamp: w.to + 30 * DAY }, 1),
      ]),
    );
    expect(survivor.map((x) => x.type)).toContain("bear_survival");

    const seller = extractMoments(
      timeline([
        ev({ timestamp: w.from - 90 * DAY }, 0),
        ev({ kind: "token_transfer", direction: "out", timestamp: w.from + 10 * DAY, token: { address: "0xt", symbol: "X", decimals: 18 } }, 1),
        ev({ timestamp: w.to + 30 * DAY }, 2),
      ]),
    );
    expect(seller.map((x) => x.type)).not.toContain("bear_survival");
  });

  it("finds quiet_year, degen_era, diamond_era, full_exit, faceplant", () => {
    const events: TimelineEvent[] = [ev({}, 0)];
    // quiet gap of 400 days
    events.push(ev({ timestamp: T0 + 400 * DAY }, 1));
    // degen burst: 25 events in 10 days
    for (let i = 0; i < 25; i++) events.push(ev({ timestamp: T0 + 420 * DAY + i * 8640 }, 10 + i));
    // diamond: token in, never out, 400+ days before last event
    events.push(ev({ kind: "token_transfer", direction: "in", timestamp: T0 + 430 * DAY, token: { address: "0xd1a", symbol: "HODL", decimals: 18 }, value: "5" }, 50));
    // full exit: in then all out
    events.push(ev({ kind: "token_transfer", direction: "in", timestamp: T0 + 431 * DAY, token: { address: "0x90ne", symbol: "GONE", decimals: 18 }, value: "5" }, 51));
    events.push(ev({ kind: "token_transfer", direction: "out", timestamp: T0 + 432 * DAY, token: { address: "0x90ne", symbol: "GONE", decimals: 18 }, value: "5" }, 52));
    // faceplant
    events.push(ev({ failed: true, timestamp: T0 + 433 * DAY }, 53));
    // last event far in the future so diamond qualifies
    events.push(ev({ timestamp: T0 + 900 * DAY }, 54));

    const types = extractMoments(timeline(events)).map((x) => x.type);
    for (const t of ["quiet_year", "degen_era", "diamond_era", "full_exit", "faceplant"]) {
      expect(types, `missing ${t}`).toContain(t);
    }
  });

  it("is deterministic", () => {
    const t = timeline([ev({}, 0), ev({ failed: true }, 1), ev({}, 2)]);
    expect(extractMoments(t)).toEqual(extractMoments(t));
  });
});

describe("archetype engine", () => {
  it("near-empty wallet → THE UNWRITTEN", () => {
    const a = assign(timeline([ev({}, 0)]), []);
    expect(a.archetype.id).toBe("unwritten");
    expect(a.evidence.length).toBeGreaterThan(0);
  });

  it("NFT-heavy wallet → TRICKSTER", () => {
    // human cadence: irregular gaps, daytime hours (a metronome at midnight IS a machine)
    const events = Array.from({ length: 30 }, (_, i) =>
      ev(
        {
          timestamp: T0 + i * DAY + ((i * 9973) % 50000) + 8 * 3600,
          ...(i % 2 === 0
            ? { kind: "nft_transfer" as const, direction: "in" as const, token: { address: "0xn", symbol: "K", decimals: 0, tokenId: String(i) }, counterparty: `0xc${i}` }
            : { counterparty: `0xc${i}` }),
        },
        i,
      ),
    );
    const tl = timeline(events);
    const a = assign(tl, extractMoments(tl));
    expect(a.archetype.id).toBe("trickster");
  });

  it("metronome bot → MACHINE", () => {
    const events = Array.from({ length: 40 }, (_, i) =>
      ev({ timestamp: T0 + i * 3600, isContractCall: true, counterparty: "0xbot" }, i),
    );
    const tl = timeline(events);
    const a = assign(tl, extractMoments(tl));
    expect(a.archetype.id).toBe("machine");
  });

  it("every assignment has evidence (kill condition #2)", () => {
    const wallets = [
      timeline([ev({}, 0)]),
      timeline(Array.from({ length: 12 }, (_, i) => ev({ timestamp: T0 + i * 90 * DAY }, i))),
      timeline(Array.from({ length: 50 }, (_, i) => ev({ isContractCall: true, functionName: "swap", timestamp: T0 + i * DAY }, i))),
    ];
    for (const tl of wallets) {
      const a = assign(tl, extractMoments(tl));
      expect(a.evidence.length).toBeGreaterThan(0);
      expect(a.version).toBe(ARCHETYPES_VERSION);
    }
  });

  it("tie-break order is published and stable", () => {
    expect(TIE_BREAK).toEqual(["machine", "baron", "oracle", "trickster", "duelist", "wanderer"]);
  });

  it("stats are 0-100 and deterministic", () => {
    const tl = timeline(Array.from({ length: 20 }, (_, i) => ev({}, i)));
    const t = computeTraits(tl, extractMoments(tl));
    const s1 = computeStats(t);
    const s2 = computeStats(t);
    expect(s1).toEqual(s2);
    for (const v of Object.values(s1)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});

describe("level generator", () => {
  const richTimeline = () => {
    const events: TimelineEvent[] = [ev({}, 0)];
    events.push(ev({ kind: "nft_transfer", direction: "in", token: { address: "0xn", symbol: "K", decimals: 0, tokenId: "1" }, timestamp: T0 + 10 * DAY }, 1));
    events.push(ev({ timestamp: T0 + 500 * DAY }, 2)); // quiet gap
    for (let i = 0; i < 25; i++) events.push(ev({ timestamp: T0 + 520 * DAY + i * 8000, failed: i === 3 }, 10 + i));
    events.push(ev({ timestamp: T0 + 1500 * DAY }, 90));
    return timeline(events, "0xDEADBEEF");
  };

  it("same wallet → identical level; different wallet → different level", () => {
    const tl = richTimeline();
    const m = extractMoments(tl);
    const l1 = generateLevel(tl, m);
    const l2 = generateLevel(tl, m);
    expect(JSON.stringify(l1)).toBe(JSON.stringify(l2));

    const tl2 = { ...tl, address: "0xother" };
    const l3 = generateLevel(tl2, extractMoments(tl2));
    expect(JSON.stringify(l3)).not.toBe(JSON.stringify(l1));
  });

  it("moments become labeled traps with real headlines", () => {
    const tl = richTimeline();
    const m = extractMoments(tl);
    const level = generateLevel(tl, m);
    const traps = level.segments.flatMap((s) => s.traps);
    expect(traps.length).toBeGreaterThan(0);
    const labels = traps.map((t) => t.label);
    for (const l of labels) expect(l.length).toBeGreaterThan(5);
    // quiet year produces the long_nothing segment
    expect(level.segments.some((s) => s.biome === "quiet")).toBe(true);
  });

  it("level always starts with GENESIS and ends with NOW", () => {
    const tl = richTimeline();
    const level = generateLevel(tl, extractMoments(tl));
    expect(level.segments[0]!.era).toBe("GENESIS");
    expect(level.segments.at(-1)!.era).toBe("NOW");
    expect(level.totalLength).toBeGreaterThan(50);
  });
});
