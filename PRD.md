# RELIC × KAIZENVERSE — Product Requirements Document v2

> Your wallet awakens as a Kaizenverse fighter. The chain decides who you are.
> Deterministic character forge + evolving NFT + a 60-second run through your wallet's life.

**Hackathon:** Mantle Turing Test 2026 — deadline 2026-06-15 16:59
**Tracks:** Consumer Viral Dapp (Animoca) · Best UI/UX · Community Voting · Deployment Award
**Role in portfolio:** the viral play. Wins on shareability + IP + polish, not architecture.
**IP:** Kaizenverse is the owner's original anime IP (character sheets + 6 variant portraits
exist). Original IP = no clone-copyright smell, a real brand story for the Animoca track, and
the name carries the thesis: **kaizen = continuous improvement = an NFT that evolves as your
wallet keeps living.**

---

## 0. What changed from v1 (and what didn't)

| Kept (v1 was right) | Replaced |
|---|---|
| Deterministic moment extraction — LLM never invents history | Illustrated life-story page → **character forge + sheet** |
| Anti-slop writing spec + 10-wallet calibration gate | Tarot/manuscript art direction → **Kaizenverse IP assets** |
| Story before wallet-connect; paste-an-address entry | Single share card → **character sheet artifact + run replay card** |
| Gasless evolving ERC-721, storyHash on-chain | — |
| Mantle-first multi-chain read | — |
| Voyeur mode (run any wallet) | — |

## 1. The bet (and what kills it)

People share content about *themselves* — and they share it harder when it makes them look
like a protagonist. RELIC turns any wallet into a **Kaizenverse fighter with a character
sheet**: archetype, stats, gear, and personality notes all derived from real on-chain
evidence. "Which Kaizenverse fighter is your wallet?" is a quiz-mechanic share loop with
receipts.

**Kill conditions (each one is a blocking gate):**
1. The personality writing reads like generic AI slop → §5 hard rules + calibration gate.
2. The archetype mapping feels random ("why am I the masked one?") → every assignment must
   show its evidence on the sheet (§4).
3. The art looks like stock anime → only owner-supplied Kaizenverse assets, never generated
   filler (§6).

## 2. Core loop

```
paste/connect wallet → indexer pulls history → moment extractor finds STORY BEATS
→ ARCHETYPE ENGINE maps traits → one of 6 Kaizenverse variants
→ CHARACTER SHEET renders (stats, gear, evidence-backed personality notes)
→ share card (PNG, X-optimized character sheet)
→ optional: mint as dynamic NFT on Mantle (gasless) — your fighter
→ optional: THE RUN — play 60–90s through your wallet's life as your fighter
→ NFT re-renders as history grows ("kaizen — your fighter improves as you live on-chain")
```

Friction rule (unchanged): sheet BEFORE wallet-connect, BEFORE any signature. Read-only paste
is the entry. Voyeur mode: "I forged vitalik.eth" is free content.

## 3. Moment extraction (deterministic layer — unchanged from v1)

The extractor computes FACTS; the LLM only narrates them. No hallucinated history.

| Moment type | Detection |
|---|---|
| Genesis | first tx ever (date, what it was) |
| First NFT / first DeFi touch | first ERC-721 transfer / first router interaction |
| The Bear Survival | held through a >40% drawdown window without selling |
| The Cursed Trade | worst realized round-trip |
| The One That Got Away | sold an asset that later 5x'd+ |
| Diamond Era / Degen Era | longest hold streak / highest tx-frequency month |
| Gas Burned | lifetime gas total |
| The Quiet Year | longest dormancy gap |

Each moment = `{type, date, evidence: {txHashes, amounts}, severity}`. Evidence hashes go
on-chain in the dossier hash — the sheet is *verifiable*.

## 4. Archetype engine (new — the heart of the fusion)

Deterministic trait vector → one of the 6 existing Kaizenverse variants. Same rubric
discipline as PROVENANCE: published mapping, reproducible assignment, evidence printed on
the sheet. **No LLM in the archetype decision.**

| Variant (from banner art) | Working name | Trait signature (computed) |
|---|---|---|
| Calm swordsman (Kaisei) | **THE WANDERER** | old wallet, low tx frequency, long holds, survived ≥1 bear |
| White-hair goggles, grinning | **THE TRICKSTER** | NFT-heavy, mint sniper, high contract diversity |
| Red-hood smirk | **THE DUELIST** | DEX-heavy, high realized-PnL variance, round-trip trader |
| Gold watch + jewelry, teeth | **THE BARON** | high value moved, LP/yield positions, whale signals |
| Blindfolded smile | **THE ORACLE** | early to protocols that later blew up (timestamp percentile), quiet then precise |
| Red mecha helmet | **THE MACHINE** | bot-grade cadence, gas-optimal hours, contract-deployer |

- Tie-break order published in `archetypes.json` (versioned, hash anchored on-chain with the mint).
- Every sheet prints WHY: "THE WANDERER — first tx 2019-03-11 · 4.2y average hold · survived
  the 2022 drawdown without selling (tx 0x…)."
- Near-empty wallet → **THE UNWRITTEN** (7th archetype, silhouette art): "your story hasn't
  started — mint page one." Worst input becomes the onboarding hook.

## 5. Character sheet + writing (the share artifact)

Format = the existing Kaisei sheet, data-driven:

| Sheet field | Source |
|---|---|
| Portrait + emblem | owner-supplied variant art |
| AGE | wallet age ("AGE: 4.2 YEARS") |
| HEIGHT | total tx count ("HEIGHT: 3,847 TXS") |
| AFFILIATION | most-interacted protocol |
| ROLE | archetype name |
| STATS block (5 bars) | Conviction (hold length) · Aggression (trade frequency) · Vision (early-entry percentile) · Endurance (bear survival) · Chaos (failed-tx + 3am activity) |
| PERSONALITY & NOTES | LLM-written, 40–70 words, **every claim cites an extracted moment** |
| COLOR PALETTE | variant palette chips (from the sheets) |

Anti-slop spec carries over verbatim from v1: banned words ("journey", "space", "wagmi",
"to the moon", any sentence that fits every wallet), ≥1 specific number per paragraph,
post-generation validation that every date/amount appears in the extracted moments
(PROVENANCE-style number check — code exists in provenance/src/narrative, port it).
**10-wallet calibration gate is blocking:** fresh wallet, OG, degen, NFT collector, one-tx
tourist, whale, bot, dormant, LP farmer, the owner's own — all 10 sheets must read DIFFERENT.

## 6. Art pipeline (constraint, decided)

- **Only owner-supplied Kaizenverse assets.** Needed as PNGs before Phase 2:
  6 variant portraits (cropped singles) · compass-star emblem · palette chips · optional
  katana/gear details · 1 silhouette for THE UNWRITTEN.
- Image-gen MCP is down and stays out of the dependency chain. If an asset is missing,
  the variant ships text-only with emblem + palette — never stock-anime filler.
- Sheet composited server-side (satori/canvas) at 1200×675 and 1080×1920 (story format).

## 7. THE RUN (the game — phase-gated, never hostage)

60–90s side-scrolling run, 2D canvas, deterministic from the same moment data:

- Stages = eras of the wallet (Origins → Crucible → Now), backdrop tint per era.
- Encounters = moments: The Cursed Trade is a boss; Bear Survival is a survival wave; Gas
  Burned is falling debris; The Quiet Year is an empty stretch with one save lantern.
- You play your variant (sprite from portrait, 2-frame run cycle is enough).
- Score = style + survival; end screen = run card (share artifact #2) + mint CTA.
- Seeded by wallet address → same wallet, same run → speedrunnable, comparable, verifiable.
- **Gate:** built ONLY after forge → sheet → share → mint is demoable end-to-end. If time
  dies, the run is cut and the demo still stands. The run is the "more fun," not the spine.

## 8. Contract + deployment award compliance (unchanged shape)

`contracts/Relic.sol` (ERC-721, Mantle Sepolia **5003**):
- `mintRelic(address subject, bytes32 sheetHash, string uri)` — gasless via sponsor relayer.
- `refreshRelic(tokenId, newSheetHash, newUri)` — kaizen mechanic: stats/notes re-render as
  history grows; archetype can EVOLVE (Wanderer → Baron) and the sheet shows the lineage.
- sheetHash = keccak{moments evidence + archetype assignment + notes text} → AI-pipeline
  output written on-chain (deployment award checkbox).
- archetypes.json hash anchored at deploy (methodology pinning, PROVENANCE pattern).
- Verify on explorer.sepolia.mantle.xyz. Address in README + submission.

## 9. Chain scope (unchanged)

Mantle (5000) read first, Ethereum mainnet second, merged. Mantle is home/publish chain:
"we bring your whole history TO Mantle."

## 10. Judging map

| Surface | How it scores |
|---|---|
| Consumer Part B (Animoca) | **Task 0 unchanged: fetch exact criteria from the judging spreadsheet before Phase 1.** Original IP + collectible fighters is squarely Animoca's thesis — say it in the submission text. |
| Part A UX + UI/UX award | gasless + paste-an-address = max accessibility; AI presented as the Forge (a character), not a chatbot; sheet format is inherently screenshot-beautiful |
| Community Voting | every sheet is a self-portrait people post; 6 variants create team identity ("Tricksters rise up") — built-in reply-bait |
| Deployment award | verified contract + sheetHash on-chain + public frontend + video |

## 11. Demo flow (video ≥2min)

1. Paste vitalik.eth → THE ORACLE forges live, evidence lines visible → laugh beat on a stat.
2. Paste YOUR wallet → different variant → mint → explorer shows sheetHash tx.
3. Share card into an X draft — "the growth loop."
4. (If built) 30s of THE RUN — boss intro card: "THE CURSED TRADE — March 2024."
5. Wallet does something new → refresh → stats tick up, "kaizen" stamp animates.
6. Close: "Every wallet is already a character. Mantle is where it awakens."

## 12. Risks

| Risk | Mitigation |
|---|---|
| AI-slop notes | §5 hard rules + number validation (ported from provenance) + 10-wallet gate |
| Archetype feels arbitrary | evidence printed on sheet; published mapping; tie-break order versioned |
| Art assets late | text+emblem fallback per variant; owner ships PNGs before Phase 2 starts |
| Game eats the deadline | §7 gate — run is built last, cut first |
| Indexing slow live | cache + pre-warmed demo wallets; loading state themed ("forging…") |
| Price data gaps | coingecko daily closes cached; degrade by dropping the moment, never guessing |
| IP confusion | footer line: "Kaizenverse is an original IP by <owner>" — provenance of the IP itself |

## 13. Open items for the owner (Day 1)

1. Product name on the tin: "RELIC" / "KAIZENVERSE FORGE" / "KAIZENVERSE: RELIC" — pick one.
2. Ship the art PNGs (§6 list).
3. Confirm the 6 working archetype names (Wanderer/Trickster/Duelist/Baron/Oracle/Machine)
   or rename to canon Kaizenverse lore.
