# RELIC — Task Plan

> Rules: ~/brain/skills/hackathon-execution-framework.md. Top to bottom, gates are blocking,
> commit per task. The writing-quality gates (P2) are as blocking as compiler errors.

## Phase 0 — Recon (2 hours)
- [ ] Fetch the Consumer track Part B judging criteria from the official spreadsheet
      (link in DoraHacks brief). Record dimensions+weights in CLAUDE.md. If unreachable, ask the
      owner — do NOT build against guessed criteria.
- [ ] Pick the single art direction (tarot / manuscript / archaeological-plate). Generate 3 test
      images, pick, lock the style-prompt prefix in `src/art/style.ts`.
      GATE: 3 images from different prompts look like one product.

## Phase 1 — Indexer + moment extractor (1 day)
- [ ] Scaffold (copy meridian/gaslight pattern: TS strict, viem, vitest). chains.ts with 5000 +
      5003 (Sepolia is 5003, NOT 5001).
      GATE: build green.
- [ ] History indexer: txs, token transfers, NFT transfers for an address — Mantle RPC + explorer
      API first, Ethereum mainnet public RPC second; merged timeline; disk cache per address.
      GATE: `npm run dev -- index <known-wallet>` < 30s warm, timeline JSON sane.
- [ ] Moment extractor per PRD §3 — pure functions over the timeline + cached coingecko dailies.
      Each moment carries evidence txHashes. No moment without evidence.
      GATE: unit tests with fixture timelines for ALL 8 moment types; determinism test.
- [ ] Run on 10 calibration wallets (fresh, OG, degen, collector, tourist, whale, +4); save to
      `data/calibration/`.
      GATE: each wallet yields ≥2 moments (or the empty-wallet path triggers).

## Phase 2 — Narrative engine (1 day) — THE PRODUCT
- [ ] Prompt per PRD §4 with hard rules inline. Claude API (latest Sonnet/Opus).
- [ ] Post-generation validator: every date/amount in prose exists in moments; banned-word list;
      length caps. Fail → regenerate (max 3) → loud error.
      GATE: validator test catches a planted hallucinated date.
- [ ] Calibration loop: generate stories for all 10 wallets. Read them ALL.
      GATE (subjective but blocking): 10 distinct stories, zero banned words, each has one funny
      + one warm line, none could be swapped between wallets. Iterate the prompt until true.
      Paste the 10 into the PR/commit description for the owner to spot-check.
- [ ] Empty-wallet "Chapter One" path.
      GATE: fresh address produces the onboarding story, not an error.

## Phase 3 — Visual + share card (1 day)
- [ ] Era illustrations: style-locked image-gen, cached per story hash.
- [ ] Share card compositor (satori or node-canvas): 1200×675 PNG per PRD §5.
      GATE: card for a calibration wallet looks X-feed-ready at thumbnail size (squint test).
- [ ] Frontend: paste-address → "excavating…" themed loader → story scroll (era by era) → share
      button (downloads card + opens X intent) → mint button. Editorial-landing-page skill for
      taste. Mobile-first — judges and voters open links on phones.
      GATE: full flow on a phone viewport, no wallet needed until mint.

## Phase 4 — Contract + mint (½ day)
- [ ] `contracts/Relic.sol` per PRD §6. Deploy Mantle Sepolia (5003). **Verify on explorer.**
      GATE: verified source visible; address in CLAUDE.md/README/.env.example.
- [ ] Relayer mint endpoint (server wallet pays gas; rate-limit by IP+address).
      GATE: mint from the frontend with a wallet that has 0 MNT → token visible on explorer with
      storyHash.
- [ ] `refreshRelic` path + dynamic tokenURI API.
      GATE: refresh emits event, metadata changes.

## Phase 5 — Viral mechanics (½ day)
- [ ] Voyeur mode polish: ENS resolution, 3 "famous wallet" quick-buttons on the landing page.
- [ ] OG tags so pasted links unfurl with the share card.
      GATE: link preview shows the card in an X post draft.
- [ ] Public deploy (Vercel/Netlify).
      GATE: public URL, cold load < 3s.

## Phase 6 — Submission hardening (½ day) — protected
- [ ] Full ~/brain/skills/ship-verification.md pass.
- [ ] README (setup, architecture, verified contract address, public URL, the anti-slop
      methodology section — judges should see the writing rigor).
- [ ] Demo video ≥2min per PRD §9 — record the laugh beat; pace > completeness.
- [ ] DoraHacks submission: Consumer Viral track. Deployment-award checklist line-by-line.
- [ ] Owner action (cannot be done by the agent): X launch post + voting push for Community prize.

## Cut order
voyeur quick-buttons → refresh/evolve mechanic → Ethereum-history merge (Mantle-only stories).
NEVER cut: narrative calibration gate · share card quality · verified contract · Phase 6.
