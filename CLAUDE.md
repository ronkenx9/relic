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
- Relic.sol: `0x903cfd9F9F315301A80ad6A1D85da0F2E081b1a4` (Mantle Sepolia 5003)
  - Deploy tx: `0xaa6b9e40f45bd64f0cc814e32b2f246d533d8d9702b3a89420c0630a49540611` · Sourcify exact_match
  - archetypesHash pinned: `0xba1bd6aaf492122e675553d32ba477791175193e87ffe3ebc0a01e276f432302` (= keccak of archetypes.json)
  - Token #1 = vitalik's WANDERER sheet, sheetHash `0x9b666c76…2a5d` on-chain
    (mint tx `0x095348294b810ca189ac1b4fa6d9d57256e4017dae88dd23cdf46fcc611ea0cd`)
  - Forge/minter = provenance deployer `0x093c1F3C…acd8`

## Agent lanes (avoid collisions)
- **Codex:** asset batches 2-5 (archetype sprites, world art, obstacles, UI) + sprite wiring
  in src/game/world.ts frame maps + frontend/assets/** + asset-manifest.json.
- **Claude:** engine (src/engine/**), contracts/, sheet/notes (src/sheet, src/notes),
  SUBMISSION.md, deploys (gh-pages), brain sync.
- Shared files (src/game/main.ts, frontend/index.html): small, single-purpose edits only;
  run `npm test && npm run build:web` before any commit.
