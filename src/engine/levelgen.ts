/** Level generator — Timeline + Moments + address seed → deterministic voxel troll level.
 * Same wallet, same traps, every time. Pure; browser-safe. The game renders this spec.
 *
 * Trap grammar (Level Devil school): the trap is the punchline, and every trap is
 * receipts-backed — it only spawns because the wallet actually did the thing. */
import type { Timeline } from "../indexer/types.js";
import type { Moment, MomentType } from "./moments.js";
import { hashSeed, makeRng, type Rng } from "./rng.js";

export type TrapKind =
  | "vanish_floor" // tiles drop the moment you trust them
  | "spike_pop" // spikes spawn at your landing spot
  | "runaway_coin" // collectible that flees when approached (full_exit)
  | "toll_gate" // eats collected blocks (gas_burned)
  | "dark_zone" // lights out, walk on faith (bear_survival)
  | "speed_flip" // everything accelerates (degen_era)
  | "fake_exit" // a door that isn't (faceplant)
  | "long_nothing"; // the quiet year — the trap is boredom

export interface Tile {
  x: number; // column index
  groundY: number; // top surface height (-1 = pit)
  vanish?: boolean;
  spike?: boolean;
  coin?: boolean; // collectible block (score)
}

export interface TrapEvent {
  kind: TrapKind;
  atX: number;
  width: number;
  label: string; // deadpan caption shown when triggered — cites the real moment
  date?: string;
}

export interface Segment {
  era: string; // display name
  biome: "origins" | "mintspring" | "crucible" | "darkwinter" | "neon" | "quiet" | "now";
  startX: number;
  endX: number;
  tiles: Tile[];
  traps: TrapEvent[];
}

export interface LevelSpec {
  seed: number;
  address: string;
  segments: Segment[];
  totalLength: number;
  /** Display strings for the end card. */
  momentsUsed: { type: MomentType; headline: string }[];
  /** "+" when the explorer page cap was hit — counts are lower bounds (R2 honesty). */
  truncatedHint?: string;
}

const SEG_LEN = { intro: 18, moment: 26, filler: 16, finale: 14 } as const;

function flatTiles(startX: number, len: number, groundY = 0): Tile[] {
  return Array.from({ length: len }, (_, i) => ({ x: startX + i, groundY }));
}

function sprinkleCoins(tiles: Tile[], rng: Rng, density = 0.18): void {
  for (const t of tiles) if (t.groundY >= 0 && rng.chance(density)) t.coin = true;
}

/** Carve a classic Level Devil betrayal into a flat run of tiles. */
function carveTrap(kind: TrapKind, tiles: Tile[], rng: Rng): void {
  const safe = tiles.filter((t) => t.groundY >= 0);
  if (safe.length < 8) return;
  const at = rng.int(3, safe.length - 5);
  switch (kind) {
    case "vanish_floor":
      for (let i = 0; i < rng.int(2, 4); i++) safe[at + i]!.vanish = true;
      break;
    case "spike_pop":
      safe[at]!.spike = true;
      if (rng.chance(0.5)) safe[at + rng.int(2, 3)]!.spike = true;
      break;
    case "fake_exit":
      // pit right before a tempting coin cluster
      safe[at]!.groundY = -1;
      safe[at + 1]!.coin = true;
      safe[at + 2]!.coin = true;
      break;
    default:
      break;
  }
}

interface EraDef { era: string; biome: Segment["biome"]; m?: Moment }

export function generateLevel(tl: Timeline, moments: Moment[]): LevelSpec {
  const seed = hashSeed(tl.address);
  const rng = makeRng(seed);
  const byType = new Map(moments.map((m) => [m.type, m]));

  // Era order tells the wallet's story start → now
  const eras: EraDef[] = [{ era: "GENESIS", biome: "origins", m: byType.get("genesis") }];
  if (byType.has("first_nft") || byType.has("first_defi"))
    eras.push({ era: "FIRST BLOOD", biome: "mintspring", m: byType.get("first_nft") ?? byType.get("first_defi") });
  if (byType.has("degen_era")) eras.push({ era: "THE DEGEN ERA", biome: "neon", m: byType.get("degen_era") });
  if (byType.has("full_exit")) eras.push({ era: "THE ONE YOU LET GO", biome: "crucible", m: byType.get("full_exit") });
  if (byType.has("faceplant")) eras.push({ era: "THE FACEPLANTS", biome: "crucible", m: byType.get("faceplant") });
  if (byType.has("bear_survival")) eras.push({ era: "THE DARK WINTER", biome: "darkwinter", m: byType.get("bear_survival") });
  if (byType.has("quiet_year")) eras.push({ era: "THE QUIET YEAR", biome: "quiet", m: byType.get("quiet_year") });
  eras.push({ era: "NOW", biome: "now" });

  const TRAP_FOR: Partial<Record<MomentType, TrapKind>> = {
    genesis: "spike_pop",
    first_nft: "vanish_floor",
    first_defi: "vanish_floor",
    degen_era: "speed_flip",
    full_exit: "runaway_coin",
    faceplant: "fake_exit",
    bear_survival: "dark_zone",
    quiet_year: "long_nothing",
  };

  const segments: Segment[] = [];
  let x = 0;
  for (const def of eras) {
    const isQuiet = def.biome === "quiet";
    const len = isQuiet
      ? SEG_LEN.moment + 22 // the trap IS the length
      : def.m
        ? SEG_LEN.moment + Math.round((def.m.severity ?? 0) * 10)
        : def.biome === "now"
          ? SEG_LEN.finale
          : SEG_LEN.intro;

    const tiles = flatTiles(x, len);
    // gentle terrain variation (none in the quiet year — flatness is the joke)
    if (!isQuiet)
      for (let i = 6; i < tiles.length - 4; i += rng.int(5, 9)) {
        const h = rng.int(0, 1);
        for (let j = 0; j < rng.int(2, 4) && i + j < tiles.length - 4; j++) tiles[i + j]!.groundY = h;
      }
    sprinkleCoins(tiles, rng, isQuiet ? 0.03 : 0.18);

    const traps: TrapEvent[] = [];
    const trapKind = def.m ? TRAP_FOR[def.m.type] : undefined;
    if (def.m && trapKind) {
      traps.push({
        kind: trapKind,
        atX: x + Math.floor(len / 2),
        width: trapKind === "dark_zone" || trapKind === "speed_flip" || trapKind === "long_nothing" ? len : 4,
        label: def.m.headline,
        date: def.m.date,
      });
      if (trapKind === "vanish_floor" || trapKind === "spike_pop" || trapKind === "fake_exit")
        carveTrap(trapKind, tiles, rng);
    }
    // base-rate betrayals everywhere except the quiet year (deadpan ≠ empty)
    if (!isQuiet && def.biome !== "now") {
      if (rng.chance(0.8)) carveTrap("vanish_floor", tiles, rng);
      if (rng.chance(0.6)) carveTrap("spike_pop", tiles, rng);
    }

    segments.push({ era: def.era, biome: def.biome, startX: x, endX: x + len - 1, tiles, traps });
    x += len;
  }

  // Gas toll gates — your real lifetime gas, collected one gate at a time
  const gas = byType.get("gas_burned");
  if (gas && segments.length > 2) {
    const candidates = segments.slice(1, -1).filter((s) => s.biome !== "quiet" && s.biome !== "darkwinter");
    if (candidates.length) {
      const seg = candidates[rng.int(0, candidates.length - 1)]!;
      seg.traps.push({
        kind: "toll_gate",
        atX: seg.startX + Math.floor((seg.endX - seg.startX) * 0.7),
        width: 1,
        label: gas.headline,
        date: gas.date,
      });
    }
  }

  return {
    seed,
    address: tl.address,
    segments,
    totalLength: x,
    momentsUsed: moments.map((m) => ({ type: m.type, headline: m.headline })),
    ...(tl.truncated ? { truncatedHint: "+" } : {}),
  };
}
