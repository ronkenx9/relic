# RELIC — Product Requirements Document

> An AI archaeologist reads your wallet's life story and mints it as an evolving NFT on Mantle.
> Spotify Wrapped mechanics for your on-chain history.

**Hackathon:** Mantle Turing Test 2026 — deadline 2026-06-15 16:59
**Tracks:** Consumer Viral Dapp (Animoca) · Best UI/UX · Community Voting · Deployment Award
**Role in portfolio:** the viral play. Wins on shareability + polish, not architecture.

---

## 1. The bet (and what kills it)

People share content about *themselves*. RELIC turns any wallet into a personal, funny,
slightly emotional illustrated story — your first mint, the bear you survived, your most cursed
trade — and every generated story is an X-ready share card that markets the product.

**The whole bet collapses if the writing reads like generic AI slop.** The writing is the
product. Engineering is the easy 60%; the narrative voice is the hard 40%. Treat
~/brain/skills/creative-writing.md as a build dependency, not a nice-to-have.

## 2. Core loop

```
paste/connect wallet → indexer pulls history → moment extractor finds the STORY BEATS
→ narrative engine writes the era-structured story → image layer illustrates it
→ share card (PNG, X-optimized) → optional: mint as dynamic NFT on Mantle (gasless)
→ NFT re-renders as history grows ("your relic evolves")
```

Friction rule: story BEFORE wallet-connect, BEFORE any signature. Read-only address paste is
the entry point — works on any wallet you're curious about (yours, a whale's, vitalik's).
Voyeur mode is a deliberate viral surface: "I ran RELIC on <famous wallet>" is free content.

## 3. Moment extraction (deterministic layer — same discipline as PROVENANCE)

The extractor computes FACTS; the LLM only narrates them. No hallucinated history.

| Moment type | Detection |
|---|---|
| Genesis | first tx ever (date, what it was) |
| First NFT / first DeFi touch | first ERC-721 transfer / first router interaction |
| The Bear Survival | held through a >40% drawdown window without selling (price data vs. balances) |
| The Cursed Trade | worst realized round-trip (bought X, sold lower) |
| The One That Got Away | sold an asset that later 5x'd+ |
| Diamond Era / Degen Era | longest hold streak / highest tx-frequency month |
| Gas Burned | lifetime gas total, rendered as something funny ("you've paid Ethereum's rent") |
| The Quiet Year | longest dormancy gap |

Each moment = `{type, date, evidence: {txHashes, amounts}, severity}`. Evidence hashes go in the
dossier so the story is *verifiable* — a uniquely crypto twist Wrapped doesn't have.

## 4. Narrative engine — the anti-slop spec

- Structure: 3 eras max (Origins → The Crucible → Now), ~40–70 words per era + one epitaph line.
  Short. Punchy. A share card, not an essay.
- Voice: archaeologist examining artifacts — wry, specific, affectionate. Second person.
- HARD RULES baked into the prompt AND validated post-generation:
  - Every claim must reference an extracted moment (regex: dates/amounts must appear in moments).
  - Banned: "journey", "space", "hodl" (as noun), "wagmi", "to the moon", generic timeline prose,
    any sentence that could apply to every wallet.
  - At least one specific number per era (date, amount, gas figure).
  - One genuinely funny line and one genuinely warm line per story. (Subjective — human-review
    the prompt against 10 test wallets until consistent; this is a Phase-2 gate.)
- Tone calibration corpus: run on 10 real wallets (fresh wallet, OG wallet, pure degen, NFT
  collector, one-tx tourist). All 10 must produce DIFFERENT stories. Identical-vibes output =
  prompt failure, iterate.
- Edge case: near-empty wallet → "Chapter One" framing ("your story hasn't started — mint this
  page as proof you were early"). Turns the worst input into an onboarding hook.

## 5. Visual layer

- Per-era illustration via image-gen, ONE consistent art direction (pick one: tarot-card /
  illuminated-manuscript / archaeological-plate. Decide day 1, never mix).
  Use ~/brain/skills/creative-writing.md image-prompt techniques (anti-symmetry, distinctive).
- Share card: 1200×675 X-optimized PNG — grade-A typography, era headline, one illustration,
  wallet ENS/short-addr, subtle RELIC mark. Composited server-side (satori/canvas), NOT
  screenshot-dependent.
- Dynamic NFT: tokenURI points to API that re-renders metadata as wallet history grows.

## 6. Contract + deployment award compliance

`contracts/Relic.sol` (ERC-721, Mantle Sepolia 5003 — NOT 5001):
- `mintRelic(address subject, bytes32 storyHash, string uri)` — gasless via relayer (sponsor
  mints; user never sees gas). AA full integration = stretch; relayer = ship.
- `refreshRelic(tokenId, newStoryHash, newUri)` — the "evolves" mechanic.
- storyHash = keccak of {moments evidence + narrative text} → **AI inference written on-chain**
  (deployment award checkbox, verbatim).
- Verify on explorer.sepolia.mantle.xyz. Address in README + submission.

## 7. Chain scope

v1: index Mantle (5000) history natively via RPC + explorer API. Reality: most wallets' rich
history is on Ethereum/Base — so the indexer reads **Mantle first, Ethereum mainnet second**
(public RPC, read-only) and merges. Mantle is the home/publish chain; multi-chain read is
framed as "we bring your whole history TO Mantle."

## 8. Judging map

| Surface | How RELIC scores |
|---|---|
| Consumer track Part B (Animoca) | Pull exact criteria from judging spreadsheet BEFORE Phase 1 — listed as images in the brief, never read. Task 0. |
| Part A UX (5) + UI/UX award (100) | Visual 30 / Interaction 30 / AI-interaction 25 / Accessibility 15 — gasless + paste-an-address = max accessibility; AI presented as a character (the Archaeologist), not a chatbot |
| Community Voting | every story = share card = vote ad; owner's X audience is the seed bloc |
| Deployment award | verified contract + storyHash on-chain + public frontend + video |

## 9. Demo flow (video ≥2min)

1. Paste vitalik.eth (or a known whale) → story generates live → laugh beat at the Cursed Trade.
2. Paste YOUR wallet → genuinely personal story → mint → explorer shows storyHash tx.
3. Share card drops into an X post draft — "this is the growth loop."
4. New wallet does something → refresh → relic evolves.
5. Close: "Every wallet has a story. Mantle is where it lives."

## 10. Risks

| Risk | Mitigation |
|---|---|
| AI-slop output | §4 hard rules + 10-wallet calibration gate; writing reviewed by a human before ship |
| Indexing slow/flaky live | cache aggressively; demo wallets pre-warmed; loading state is themed ("excavating…") |
| Image-gen inconsistency | one art direction, fixed style prompt prefix, pre-generate demo assets |
| Price data for drawdown moments | coingecko daily closes, cached locally; degrade gracefully (drop moment, never guess) |
| Famous-wallet privacy optics | only public on-chain data; no doxxing language; "voyeur mode" framed as homage |
