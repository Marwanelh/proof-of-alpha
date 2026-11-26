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
- Atlas free push feeds live on **BSC mainnet** (e.g. feed #1164, `Crypto`+`Free`), 60s heartbeat.
  **The proxy is a MultiFeed**: `latestRoundData()` reverts; use `fetch(bytes4 feedId)` →
  `PriceSnapshot{price, aggregatedTs, onchainTs}`. `isOpenRead()` was **true** on the feed we probed,
  and `decimals()` is **18** (registry-wide). The catalogue number (#1164) is **not** the on-chain
  `feedId` — `fetch()` reverts on it. Get the 4-byte id from the Atlas team before you wire the contract.
  The registry reverts with `FeedNotOpenRead()` at deploy if the feed is whitelist-only.
- **A testnet contract cannot read mainnet Atlas.** See "How we use Atlas" below.

## How we use Atlas

We read Atlas prices **directly from the chain, with no key.** Atlas publishes prices to a MultiFeed
contract on BSC mainnet; we call that contract over a free public RPC, the same way we read any other
on-chain data — no sign-up, no key, no account, no billing. **This on its own satisfies the CMC × Atlas
requirement** ("read an on-chain feed").

| | |
|---|---|
| Contract | Atlas MultiFeed on BSC mainnet (56). One registry, one `feedId` per asset |
| Read | `fetch(bytes4 feedId)` → `{uint80 price, uint48 aggregatedTs, uint48 onchainTs}`; `fetchBatch` for several assets in one call |
| Precision | `decimals()` — one value for the whole registry (18 on the registry we probed) |
| Access | `isOpenRead()` must be `true`. On a whitelist-only feed a contract read is blocked while a manual read looks fine |
| Cost | Free. The paid tiers ($465+/mo) are for **creating** custom feeds, not for reading free ones |
| Gotcha | The `feedId` is a 4-byte on-chain id, **not** the catalogue number in the UI, and it cannot be enumerated from the contract — see `docs/integration-findings.md` |

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

### What we need before coding (both items are Atlas's to give)

- [x] **The MultiFeed contract address on BSC mainnet** — `0xeace519ebb14fb8404fa6ddd23c3b34abade44aa`
      (verified live: `contractType()` = 2 MultiFeed, `decimals()` = 18, `isOpenRead()` = true). A MultiFeed
      is one registry per chain holding many feeds, so this address serves every free BNB-Chain feed.
- [x] **A working `feedId`** — catalogue `#1164` is feedId **`0x0000048c`**, and it reads live and keyless
      (verified: `$85.94`, updated seconds before the read). **The earlier "you cannot get a feedId" claim was
      wrong** — the calldata was malformed; see `docs/integration-findings.md` §2b.
- [ ] **The `feedId` for the assets we actually track** (BNB, CAKE) — still worth asking Atlas at the venue.
      The mechanism is proven; only the per-asset id is missing.

Addresses: see [`docs/addresses.md`](docs/addresses.md) (fill in after deploy).

## Cournot Integration

The Cournot track asks for this section by name, so it answers its four questions directly.

**Where we call it.** `server/cournot.ts` is the only place that talks to Cournot. It drives the official
skill client against `https://interface.cournot.ai`, calling `resolve` to turn a social post into a
probability for one discrete market, and `prepare` when a call needs the paid prepare step. Extraction —
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

**Proof of a successful call.** `evidence/evidence.json` carries the request id and the sanitised
response, written by `npm run smoke` and kept in the repo as the artifact the brief asks for.

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
