# RELIC — consumer viral submission (Mantle Turing Test)

AI archaeologist: wallet history → illustrated life story → evolving NFT on Mantle, gasless.
The writing is the product; treat narrative gates as blocking.

## Read order (mandatory)
1. ~/brain/skills/hackathon-execution-framework.md — your operating contract
2. PRD.md
3. TASKS.md — first unchecked box
4. ~/brain/projects/RELIC.md — current state

## Verified facts
- Mantle Sepolia chain id = 5003 (NOT 5001)
- Consumer track Part B criteria: NOT yet fetched (Phase 0 task — spreadsheet in DoraHacks brief)
- Anti-slop spec: PRD §4 + ~/brain/skills/creative-writing.md

## Deployed addresses / live state (2026-06-11)
- Game (THE RUN): https://ronkenx9.github.io/relic/ — voxel troll-platformer, fully client-side
  forge (Routescan keyless API; explorer.mantle.xyz was DOWN — do not switch back without checking)
- Repo: https://github.com/ronkenx9/relic · Demo snapshots: frontend/demo/*.json (R6)
- Art direction UPDATE (2026-06-12, owner decision): Codex generates Kaizenverse asset batches
  (owner-art-directed — supersedes the "owner PNGs only" rule; still NO Minecraft IP). Batch 1
  (Base Kaizen sprite sheet + frames + portrait/icon) landed in frontend/assets/kaizen/;
  Wanderer uses the sprite, other archetypes keep voxel fallback until their batch lands.
- Contract (Relic.sol) NOT deployed yet — next phase with character sheet + mint.

## Agent lanes (avoid collisions)
- **Codex:** asset batches 2-5 (archetype sprites, world art, obstacles, UI) + sprite wiring
  in src/game/world.ts frame maps + frontend/assets/** + asset-manifest.json.
- **Claude:** engine (src/engine/**), contracts/, sheet/notes (src/sheet, src/notes),
  SUBMISSION.md, deploys (gh-pages), brain sync.
- Shared files (src/game/main.ts, frontend/index.html): small, single-purpose edits only;
  run `npm test && npm run build:web` before any commit.
