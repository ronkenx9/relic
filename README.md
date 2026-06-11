# RELIC × KAIZENVERSE — THE RUN

Your wallet is a troll level. The chain already trolled you — the cursed exit, the gas, the
quiet year. RELIC turns any wallet's **real on-chain history** into a deterministic voxel
troll-platformer: same wallet, same traps, every time. Survive it this time.

**Mantle Turing Test 2026 — Consumer & Viral DApps track (Animoca)**

**Play it now:** https://ronkenx9.github.io/relic/ — paste any address, no wallet connection,
no signature, nothing to install.

## The loop

```
paste address → live forge (Mantle + Ethereum history via explorer API, in YOUR browser)
→ moment extractor finds the story beats (every one carries tx evidence)
→ archetype engine assigns one of 6 Kaizenverse fighters (deterministic, published mapping)
→ the level generator builds your chainscape: eras = biomes, moments = traps
→ run it · die in your own history · death counter is the share stat
→ end card: archetype, 5 stats, evidence lines, share text
```

## Receipts-backed trolling

Every trap exists because the wallet actually did the thing:

| Your real moment | The trap |
|---|---|
| Bear survival (held through 2022) | THE DARK WINTER — lights out, walk on faith |
| Busiest 30 days (degen era) | speed flip — everything accelerates |
| Token fully exited | the runaway coin — it moves away from you. familiar. |
| Lifetime gas burned | toll gate — pays itself from your collected blocks |
| Longest dormancy gap | THE QUIET YEAR — a long, flat nothing. that's the trap. |
| Failed transactions | fake exits — gas paid for nothing, again |
| First NFT / first DeFi | vanish floors where you first trusted something |

## Deterministic by construction

- Level seed = hash(address). No randomness survives a reload — speedrunnable, comparable.
- The archetype decision is **pure code** (no LLM): published trait rules, published tie-break
  order, version-stamped. Every assignment prints WHY with concrete numbers.
- Moment extraction is pure functions over the timeline; **no moment without tx evidence**.
- We make no claims we can't source: no price data → no "it later 5x'd" lines (the runaway
  coin says only what the chain shows: you let it go). Truncated histories are marked `+`.

## Architecture

```
src/engine/   browser-safe pure TS — explorer client (Routescan, keyless, CORS-open),
              moments, archetype, levelgen, seeded rng. Same code runs in CLI and browser.
src/game/     three.js — voxel world (InstancedMesh), procedural fighter from archetype
              palette (zero art assets), physics, traps, HUD, end card
frontend/     static page + demo wallet snapshots (the demo never depends on API uptime)
test/         vitest — 15 tests: moment fixtures, archetype rules, levelgen determinism
```

Chains read: **Mantle (5000)** first — "we bring your whole history TO Mantle" — then
Ethereum mainnet, merged.

## Quick start

```bash
git clone https://github.com/ronkenx9/relic && cd relic
npm install
npm test          # 15 tests
npm run build:web # bundle the game
python3 -m http.server 4500 --directory frontend   # → http://localhost:4500
```

## Honest limitations

- Explorer pagination is capped (300 events/action/chain) — long histories are lower bounds, marked `+`.
- ENS not resolved yet — paste a raw 0x address.
- Evolving-NFT mint (Relic.sol, kaizen mechanic) is the next phase — the end card shows the hook.
- Kaizenverse portrait art ships when the owner drops PNGs; the voxel fighters are procedural
  from archetype palettes by design (never stock-anime filler).

## Kaizenverse

Original IP by the owner. Six fighters, one forge: kaizen — continuous improvement — your
fighter evolves as your wallet keeps living.
