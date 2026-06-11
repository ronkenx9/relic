# RELIC × KAIZENVERSE — Task Plan v2 (matches PRD v2)

> Rules: ~/brain/skills/hackathon-execution-framework.md. Top to bottom, gates blocking,
> commit per task. Writing-quality gates are as blocking as compiler errors.
> Art constraint (PRD §6): owner-supplied Kaizenverse PNGs only; until they exist every
> variant ships **text + emblem + palette** — never stock-anime filler.

## Phase 0 — Recon
- [x] Consumer Part B criteria: official spreadsheet NOT publicly reachable (DoraHacks brief
      blocks programmatic fetch; checked 2026-06-11). Building against hackathon-wide judging
      map (Technical 30 / Innovation 25 / Mantle 25 / Completeness 20) + track brief
      ("shareable consumer applications"). ⚠️ OWNER: open the brief's spreadsheet and diff
      against PRD §10 before submission.
- [x] Art direction locked by PRD v2: Kaizenverse character-sheet format; owner PNGs pending →
      text+emblem+palette fallback ships first.

## Phase 1 — Indexer + moment extractor
- [x] Scaffold (meridian pattern: TS strict, viem, vitest, zod). chains.ts 5000+5003+1.
      GATE: build green.
- [x] History indexer: (gate met via browser forge + scripts/snapshot-demos.ts — Routescan, keyless, CORS-open; explorer.mantle.xyz was down 2026-06-11)
      Original text: txs + token/NFT transfers, Mantle (5000) first, Ethereum mainnet second,
      merged timeline, disk cache per address.
      GATE: `npm run dev -- index <wallet>` warm <30s, sane timeline JSON.
- [x] Moment extractor — 10 types (price-gated cursed_trade/got_away replaced by honest price-free full_exit/faceplant per R2) — pure functions, every moment carries evidence txHashes.
      GATE: fixture tests for all 8 moment types + determinism test.
- [ ] Calibration pull: 10 wallets → data/calibration/.
      GATE: each yields ≥2 moments or triggers THE UNWRITTEN path.

## Phase 2 — Archetype engine (the fusion core)
- [x] Trait vector (deterministic, from moments+timeline) → 6 variants + THE UNWRITTEN.
      archetypes.json = published mapping (versioned; hash anchored at contract deploy).
      GATE: unit tests — synthetic timelines hit each archetype; tie-break deterministic.
- [x] Evidence lines: every assignment prints WHY with concrete numbers + tx evidence.
      GATE: no archetype without ≥1 evidence line (tested).

## Phase 3 — Character sheet + writing
- [ ] Sheet data model: AGE/HEIGHT(txs)/AFFILIATION/ROLE/STATS(5 bars)/palette per PRD §5.
- [ ] Notes writer: LLM 40–70 words, every claim cites an extracted moment; number-validator
      ported from provenance; banned words; deterministic template fallback when no API key.
      GATE: validator catches a planted hallucinated date/amount (tested).
- [ ] THE UNWRITTEN onboarding path for empty wallets.
      GATE: fresh address → onboarding sheet, not an error.
- [ ] Calibration read: 10 sheets must read DIFFERENT. ⚠️ OWNER spot-check queued (subjective
      gate — agent does a first pass, owner confirms before submission).

## Phase 4 — Contract (deployment award)
- [ ] Relic.sol: ERC-721, mintRelic(subject, sheetHash, uri), refreshRelic (kaizen evolution),
      archetypesHash pinned at deploy. Foundry tests.
      GATE: forge tests green.
- [ ] Deploy Mantle Sepolia 5003 + Sourcify verify + record address in CLAUDE.md.
      GATE: eth_getCode non-empty, verified, address recorded.
- [ ] Mint one real sheet (sheetHash on-chain) as the deployment-award proof tx.

## Phase 5 — Frontend (the consumer surface)
- [x] Forge page (as THE RUN gate — owner re-ordered: game-first): paste address → moments → archetype → character sheet. Sheet BEFORE any
      wallet-connect. Loading themed ("forging…"). Text+emblem+palette art with PNG slots
      that light up when owner art lands in frontend/assets/.
      GATE: full flow on a phone viewport, no wallet needed.
- [ ] Share card: downloadable sheet PNG (1200×675) via canvas.
      GATE: squint test at thumbnail size.
- [x] Static public deploy (GitHub Pages) → https://ronkenx9.github.io/relic/ with pre-forged demo wallets (R6 snapshot rule).
      GATE: public URL loads on a phone.

## Phase 6 — Submission hardening (protected)
- [ ] ship-verification.md pass; README (quickstart, addresses, live URL, honest limits).
- [ ] SUBMISSION.md: video script + X thread draft + BUIDL fields.
- [ ] OWNER: product name ("RELIC" / "KAIZENVERSE FORGE" / "KAIZENVERSE: RELIC").
- [ ] OWNER: Kaizenverse PNGs (6 portraits, emblem, palette chips, silhouette).
- [ ] OWNER: demo video, X post #MantleAIHackathon, DoraHacks BUIDL.

## Phase 7 — THE RUN (game; gated per PRD §7 — only after P0–P6 demoable)
- [x] THE RUN shipped FIRST by owner decision — three.js voxel troll-platformer, deterministic
      from wallet (Level Devil trap grammar mapped to real moments), live-verified vs vitalik
      + 2 active Mantle wallets, mobile gate checked, demo snapshots committed (R6).

## Cut order (behind schedule → top down)
THE RUN → share-card PNG → Ethereum-mainnet merge (Mantle-only forge still demos) → gasless
relayer (read-only mint CTA still demos).
NEVER CUT: archetype evidence lines · validator gates · contract verification · Phase 6.
