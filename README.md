# Proof of Alpha

A credit record for crypto KOLs. Every call becomes a verifiable claim, priced against what the market
already expected (Cournot), locked on BNB Chain before the outcome is known, and scored once it resolves.

**Headline metric — Edge.** `Edge_call = outcome − p`, where `p` is the Cournot probability of the claim
at the moment it was posted. A consensus hit at p=0.9 earns +0.1; a contrarian hit at p=0.2 earns +0.8;
a confident miss at p=0.7 costs −0.7. Raw hit rate rewards a bull market; Edge does not.

## The loop

```
CMC Community post ──▶ LLM extracts {asset, direction, target, deadline}
                            │
                            ├─▶ Cournot: probability + claim + evidence   (the baseline)
                            ├─▶ CMC price + Atlas on-chain price          (the snapshot)
                            └─▶ CallRegistry.recordCall() on BNB Chain    (the receipt)
                                        │
                    at deadline + 1d/7d/30d ──▶ resolve ──▶ hit/miss, return, Edge
                                        │
                                        └─▶ Living Brain: per-KOL memory, linked calls
```

## Setup

```bash
cp .env.example .env          # fill in: CMC key, Atlas feed address, wallets, Living Brain, LLM
node --version                # need >= 22.20 (Cournot skill requirement)
node scripts/smoke.mjs        # proves each integration before you write app code
```

Foundry (contracts):
```bash
curl -L https://foundry.paradigm.xyz | bash && foundryup
forge test
forge script script/Deploy.s.sol --rpc-url $BSC_TESTNET_RPC --broadcast
```

## Verified integration facts (do not re-discover these)

Full evidence with raw responses: [`docs/integration-findings.md`](docs/integration-findings.md).

- `GET /v1/content/posts/latest` needs an **API key** and **exactly one** of `id`, `slug`, `symbol`.
  There is **no `limit` param** and no global "all posts" call — the backtest must use a symbol watchlist
  and page backwards with `last_score`. Costs 0 credits, cache 5 minutes.
- CMC also serves a **keyless** base on the same host: `https://pro-api.coinmarketcap.com/public-api/...`
  (prices, DEX, k-line). Its envelope puts quotes in an **array** (`data[0].quotes[0].price`).
- Atlas publishes **two contract shapes**, both live and keyless on **BSC mainnet (56)**:
  - **MultiFeed** — `0xeace519ebb14fb8404fa6ddd23c3b34abade44aa`, one contract serving many feeds, read with
    `fetch(bytes4 feedId)` → `{price, aggregatedTs, onchainTs}`. **The catalogue number IS the on-chain id**
    (#1164 → `0x0000048c`, verified live at `$85.94`), and `decimals()` is 18 registry-wide. The earlier
    "catalogue ≠ feedId" claim was **wrong**: `fetch()` reverted because a `bytes4` argument must be
    ABI-encoded as a **right-padded 32-byte word**, not four bare bytes.
  - **SingleFeed** — one contract per pair per network, Chainlink-compatible: `latestRoundData()`, plus
    `description()` naming the pair it prices. **BNB/USD on BSC mainnet is
    `0x9C0517F5b4c8657c7F18D68d2d79e2b3b1cd6438`**; `description()` returns `bnb/usd`, and its price matches
    CMC's BNB quote within cents at the same moment (verified live: `$551.35` vs `$551.42`). MultiFeed ids
    in the catalogue do **not** cover the majors — the native BNB feed is a SingleFeed with its own address.
- **A read is only a price *for an asset* if the feed says it prices that asset.** So every snapshot carries
  the contract shape (`kind`) and the contract's own `description()`, and the receipt prints both. Reading a
  feed that prices something else and labelling it carefully is not the same as reading the right feed.
- **A testnet contract cannot read mainnet Atlas.** See "How we use Atlas" below.

## How we use Atlas

We read Atlas prices **directly from the chain, with no key.** Atlas publishes to contracts on BSC mainnet;
we call them over a free public RPC, the same way we read any other on-chain data — no sign-up, no key, no
account, no billing. **This on its own satisfies the CMC × Atlas requirement** ("read an on-chain feed").

Which contract we call depends on the asset, and the receipt says which one it used:

| | |
|---|---|
| **BNB/USD (what our calls are about)** | SingleFeed `0x9C0517F5b4c8657c7F18D68d2d79e2b3b1cd6438` on BSC mainnet. `latestRoundData()` → `{roundId, answer, startedAt, updatedAt, answeredInRound}`, `description()` = `bnb/usd` |
| **Tokenized-asset feeds** | MultiFeed `0xeace519ebb14fb8404fa6ddd23c3b34abade44aa`: `fetch(bytes4 feedId)` → `{price, aggregatedTs, onchainTs}`; `fetchBatch` for several in one call. Catalogue number = on-chain id |
| Precision | `decimals()` — 18 on both contracts we read |
| Access | Keyless and free. The paid tiers are for **creating** custom feeds, not for reading free ones |
| Cost | Zero. No account, no key, no billing |
| Gotcha | A `bytes4` argument must be ABI-padded to a 32-byte word, or `fetch()` reverts with an empty reason — which reads exactly like a wrong id. And a MultiFeed id cannot be enumerated from the contract, so the catalogue is the source |

The address at the venue settled this: the native **BNB/USD** feed is a **SingleFeed**, not part of the
MultiFeed registry. `server/atlas.ts` therefore has two paths — `feedId` set means MultiFeed, unset means
SingleFeed — and both are pinned to a single block, so the receipt's "check it at this block" is a claim
someone can actually check.

### A testnet contract cannot read mainnet Atlas

The original design had `CallRegistry` on BSC testnet read Atlas itself. That does not work: **a testnet
contract cannot read mainnet data**, and there is no cross-chain read without a bridge or an oracle callback.

- **Plan A — default.** The backend reads the Atlas price on **mainnet** over the keyless public RPC and
  writes it into the **testnet** receipt together with the claim, the Cournot probability and the CMC price.
  The receipt stores the price plus the Atlas timestamp **and the mainnet block it was read at**, so anyone
  can check the stored price against Atlas's mainnet history. `CallRegistry.recordCallReferenced()` does this
  and flags the call `atlasVerified = false` — the price is referenced, not verified by the contract.
- **Plan B — bonus, if time allows.** Deploy `CallRegistry` on **BSC mainnet (56)**, where the contract reads
  the feed in the same transaction as the write. Gas is cheap on BSC, the price is verified on-chain rather
  than referenced, and it earns the challenge's mainnet bonus. `recordCall()` does this and sets
  `atlasVerified = true`.

**One ABI, two deployments:** a registry built with a feed address reads the feed itself; a registry built
with `address(0)` only accepts referenced prices. Each refuses the other's call, so there is no way to
silently present a referenced price as a verified one.

### Atlas access — resolved, and the last item was found rather than given

- [x] **The MultiFeed contract address on BSC mainnet** — `0xeace519ebb14fb8404fa6ddd23c3b34abade44aa`
      (`contractType()` = 2 MultiFeed, `decimals()` = 18, `isOpenRead()` = true).
- [x] **A working `feedId`** — catalogue `#1164` is feedId **`0x0000048c`**, reading live and keyless.
      **The earlier "you cannot get a feedId" claim was wrong** — the calldata was malformed.
- [x] **The feed for the asset we actually track.** This was on the list to *ask Atlas for*. It did not need
      asking: the public catalogue was searched by pair, and the native **BNB/USD** feed turned out to be a
      **SingleFeed** at `0x9C0517F5b4c8657c7F18D68d2d79e2b3b1cd6438` on BSC mainnet rather than a MultiFeed
      id. Verified live: `description()` = `bnb/usd`, `latestRoundData()` = `$551.35` at block 135890573
      while CMC's keyed quote read `$551.42` in the same run. The receipt now shows a price for the asset the
      call is about, with no disclaimer, because it is the right feed.

Addresses: see [`docs/addresses.md`](docs/addresses.md) (fill in after deploy).

## Cournot Integration

The Cournot track asks for this section by name, so it answers its four questions directly.

**Where we call it.** `server/cournot.ts` is the only place that talks to Cournot. It drives the official
skill client against `https://interface.cournot.ai`, calling `resolve` to **match** a post to a discrete
market — it returns candidate markets and a `matching_confidence`, **not** a probability — and `prepare` for
the market-assigned probability, which is the metered step. Extraction —
post → claim, direction, target, deadline — lives in `server/claim.ts`, and it refuses a post it cannot
parse rather than guessing a claim to price.

**How the probability is used.** It is the baseline of the product's headline metric,
`Edge_call = outcome − p`, held in basis points with integer arithmetic so the aggregate cannot drift. A
call the market was already 90% sure of therefore earns `0.10` when right and `−0.90` when wrong, which is
the whole point of the product: repeating the consensus is not alpha. That number sets each call's Edge
(`server/records.ts`), it is what the leaderboard ranks on, and it is handed to the answer model as
pre-computed fact (`buildFacts`) so the prose cannot recompute it.

**Where users see the claim and the evidence.** The receipt panel shows the claim Cournot evaluated, the
returned probability, and Cournot's evidence verbatim. Our commentary is visually separated and labelled
`Our note`, so a reader can always tell the oracle's words from ours. The same panel sits on the KOL page
and behind every leaderboard row.

**What has actually been called, and what has not.** `resolve` is free and it **succeeded**:
`evidence/cournot/live-resolve-raw.json` is the raw reply — `code: 0`, five candidate markets, best match
`#113195` at `matching_confidence` 0.855, `charged: false`. `prepare` — the call that returns the probability —
returned `payment_choice_required`, recorded verbatim in `evidence/cournot/prepare-raw.json`. So there is **no
successful probability call yet, no request id, and `evidence/evidence.json` holds `null` for Cournot**: it is
not the proof the brief asks for, and this section will not present it as one. The brief's gate is one
successful live call whose returned probability drives a decision — that gate is **unmet** until one is
funded. What is proven is the plumbing and the refusal: the pipeline would rather score nothing than label an
invented number as Cournot's.

**Current state, stated plainly.** This machine has spent its **three free calls** — Cournot meters three
per IP with no reset — so calls made today carry `provenance: "fixture"`. That is not hidden. The response
is typed with its provenance, `isSponsorEvidence()` returns false for a fixture, and a fixture therefore
**cannot** be scored as Cournot Edge: `server/resolve.ts` refuses it outright rather than producing a
number that merely looks like evidence. Until a live call is funded, no Edge figure here claims Cournot as
its source, and the leaderboard says so on its own page.

A live call is one payment away — **$0.01 per call** through x402 on Base or b402 on BNB Chain, or a
$5/600 pack. The wallet is installed and connected (`baw` CLI 1.12.0); it needs a funded balance. So this
section currently describes an integration that is built, tested, and explicit about which of its numbers
came from the oracle and which did not. The brief says mocked probabilities do not qualify — nothing here
pretends they do.

## Track eligibility

Tick these against the briefs before submitting. Each line is a stated requirement, not a nicety.

### Developer Track — Build on BNB Chain ($10,000 pool)
- [x] Project built on BNB Chain (RWA / on-chain AI agent focus themes — this is an on-chain AI agent)
- [ ] Demo video ≤ 3 minutes → `docs/demo-script.md`, recording path `evidence/demo.mp4`
- [x] Focus themes covered: on-chain AI agent + Trading
- Evidence a judge can check: `CallRegistry` address, `CallRecorded`/`CallResolved` logs.

### CoinMarketCap × Atlas Challenge ($10,000 shared pool)
- [ ] ≥1 **live Pro API call** in a core feature → `GET /v1/content/posts/latest` is the call source
      (`scripts/smoke.mjs` prints the request id and HTTP status as proof)
- [ ] Atlas: read an on-chain feed (push) — `CallRegistry.recordCall` does the read on mainnet
- [ ] Deploy on BNB Chain — testnet qualifies, **mainnet is a bonus** → deploy mainnet (56)
- [ ] Open/shared repo with working data calls + README setup instructions
- [ ] One-page write-up: problem & audience, endpoints/feeds used and why, contract addresses, what's next
      → `docs/one-pager.md`
- [ ] **API keys out of the front end and out of the repo.** Usage verifiable via API logs tied to our key,
      or on-chain reads. Our proof artifact: `evidence/evidence.json` (request ids + tx hashes).
- Rubric: data integration depth 25 · real-world potential 25 · BNB Chain & RWA focus 20 · technical
  quality & safety 15 · originality 10 · demo & presentation 5.

### Cournot — Intelligence Oracle (2,000 USDT)
- [ ] ≥1 **successful live call** to the official skill, with a request ID or sanitised log as proof
- [ ] The returned probability **drives a real decision** — it sets each call's Edge baseline and weighs
      the "ask the agent" answer. Mocked/hardcoded probabilities do not qualify.
- [ ] Show the exact claim evaluated + Cournot's evidence verbatim (`CournotResponse` panel, our own
      commentary labelled `Our note`)
- [x] README section titled **"Cournot Integration"**: where we call it, how the probability is used,
      where users see claim + evidence, and proof of a successful call → § Cournot Integration
- [ ] **Fund a live call: $0.01 per call** (x402 on Base / b402 on BNB Chain), or a $5/600 pack. `baw` is
      installed and connected; it needs a balance. One call satisfies the requirement, so per-call is
      cheaper than a pack.
- [ ] Demo + backup recording
- Gate: all three build requirements must pass or the project is not scored.
- Rubric: integration depth 35 · product potential 25 · innovation 20 · execution & UX 20.

### ChatAndBuild — Living Brain (in-kind)
- [ ] Working AI agent using Living Brain as its persistent memory layer (API / SDK / MCP / CLI)
- [ ] Demo video **3–5 minutes** showing the three verbs: **remember** (write resolved calls),
      **retrieve** ("how did this KOL do on meme tokens?"), **connect** (KOLs who post the same token
      together)
- [ ] Short description: problem, solution, what makes it unique
- Note: captures are **asynchronous** — pre-warm the brains before the demo, never show a spinner.

### Not entering
- Flap, Four.meme/OpenFour — different product surface.
- AWS credits — requires AWS Activate eligibility and a **valid business registration**.

## Judging notes
Design and usability · scalability · innovation · open source · integration, plus roadmap, community and a
sustainable business model. Every score links to the calls and the on-chain receipts behind it.

## Fairness and safety rules we hold ourselves to
- Flags state facts, never accusations: "wallet sold 41% within 26 minutes of the post", not "dump".
- Vague posts with a defaulted horizon are labelled; posts with no testable claim are stored as `opinion`
  and not scored.
- A KOL needs a minimum number of resolved calls before appearing on the leaderboard.
- Keys live only in the backend environment. The backend never holds user funds.
- Tokenized-RWA / ETF-style concepts stay mock or testnet unless independently reviewed.

## Repo layout
```
contracts/src/CallRegistry.sol   receipt registry (Chainlink-compatible Atlas read)
contracts/test/CallRegistry.t.sol
contracts/script/Deploy.s.sol
scripts/smoke.mjs                integration smoke test → evidence/evidence.json
docs/integration-findings.md     live probe results, raw responses, the traps
docs/one-pager.md                the required one-page write-up
docs/demo-script.md              3-minute stage script + backup
docs/submission-checklist.md     tick-list per track
```
