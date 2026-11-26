# Integration findings — verified 2026-11-26 16:29–16:35 (UTC+7)

Every claim below is from a live probe or the vendor's own doc, not from memory. Raw responses are quoted.
Probe host: this machine, plain `curl`, no API keys.

## 1. CoinMarketCap — two different bases, and the content endpoints are NOT keyless

CMC now runs a **Keyless Public API** on the same host, prefix `/public-api`:

```
OK   HTTP 200  GET https://pro-api.coinmarketcap.com/public-api/v2/simple/price?symbol=BNB,CAKE&convert=USD
{"data":[{"id":1839,"name":"BNB","symbol":"BNB","slug":"bnb",
  "quotes":[{"symbol":"USD","price":552.6301590837155}]},
 {"id":7186,"name":"Pancake","symbol":"CAKE","slug":"pancakeswap",
  "quotes":[{"symbol":"USD","price":1.5722643083908194}]}], ...}
```

Two gotchas visible in that response:

- **`quotes` is an array**, not the `quote.USD.price` object of the classic Pro envelope. If your backend
  was written against the old shape it will silently read `undefined`.
- Keyless = IP-shared rate pool, so a 429 is normal; back off (the official SDK does it for you).
  A free key raises limits and returns "the same response shape".

**Content endpoints reject keyless calls.** All four of these are 403 without a key:

```
HTTP 403  /public-api/v1/content/posts/latest?symbol=BNB
  {"status":{"error_code":1005,"error_message":"An API Key is required for this call."}}
HTTP 403  /public-api/v1/content/posts/latest?slug=binancecoin
HTTP 403  /public-api/v1/content/posts/top?symbol=BNB
HTTP 403  /public-api/v1/content/latest?limit=1
```

and the endpoint is stricter than its own docs:

```
HTTP 400  /public-api/v1/content/posts/latest
  {"status":{"error_code":400,
   "error_message":"Exactly one of `id`, `slug`, or `symbol` is required for this endpoint"}}
```

Doc says `id` / `slug` / `symbol` are all `required: false`. The API says **exactly one is required**.

### What this changes for Proof of Alpha

| Brief assumed | Reality |
|---|---|
| "Free Basic key returns `/v1/content/posts/latest`" | Needs **a key** (1005 on keyless). Whether the free plan includes the Content endpoints is still unconfirmed — but they cost **0 credits** per the doc, so a free key should carry them. **Confirm with a key before you build on it.** |
| "Filter by symbol; page back with `last_score`" | Correct. Those are the only useful params: `id \| slug \| symbol` (exactly one) and `last_score`. **There is no `limit` param** and no "all posts" call. |
| Backtest "historical CMC posts" | You can only ask **per-symbol**, walking `last_score` backwards. So the backtest needs a **watchlist of symbols** (e.g. BNB, CAKE, and the BNB-Chain majors) rather than "all KOL calls". Say so on the leaderboard. |
| `GET /v1/content/latest` | Also keyed, and also not global. |

`plan credit use: 0 credit`, cache/update frequency: five minutes.

## 1b. Three bases, not two — and which one has the Content endpoints

CMC serves the same host under three prefixes. Probed 2026-11-26:

```
HTTP 200  /public-api/v2/simple/price?symbol=BNB&convert=USD          keyless
HTTP 200  /trial-pro-api/v3/cryptocurrency/listings/latest            keyless (Trial Pro API)
HTTP 200  /trial-pro-api/v2/simple/price?symbol=BNB&convert=USD       keyless
HTTP 403  /trial-pro-api/v1/content/posts/latest?symbol=BNB
          {"error_code":1005,"error_message":"An API Key is required for this call."}
```

| Base | Auth | Covers |
|---|---|---|
| `/public-api` | none | keyless subset; IP-shared quota, so 429 is normal |
| `/trial-pro-api` | none | a **fixed** subset: 19 Standard + 17 DEX endpoints (listings, quotes, global metrics, Fear & Greed, CMC indices, Altcoin Season, map/info, DEX token/pools/pairs, holders, k-line, token search). Aggressively rate-limited, subset cannot be extended |
| `/v1`, `/v2`, `/v3` | `X-CMC_PRO_API_KEY` | everything, including **Content** |

**Bottom line for this build:** the whole price side — posting snapshot, resolution, proxy-Edge, DEX
swaps/holders for sell-while-shilling — runs today with **no account at all**, on `/trial-pro-api` or
`/public-api`. Only the **call source** (`/v1/content/posts/latest`) needs a key, and it is not in either
keyless set. So the critical path is exactly one signup, and it blocks only ingest.

Free Basic plan (pro.coinmarketcap.com/signup, no credit card): **15,000 monthly credits, 50 req/min,
30+ endpoints, historical data, commercial use** — the key appears on the dashboard immediately. Some
third-party docs still say 10,000 credits; CMC's own pricing page says 15,000 as of this probe.

Unknown until a real key is tried: whether the free Basic plan includes the Content endpoints. The endpoint
is 0 credits, so it should — but it is not the keyless set, so confirm with the key before building ingest
on it. Fallback if not: the brief's verify-by-paste path, plus ask the CMC team at the venue.

## 1c. CLOSED: the free Basic plan does NOT include the Content endpoints

Probed 2026-11-26 with a real free Basic key (32-hex, no quotes, no whitespace — a correct key):

```
A) GET /v1/cryptocurrency/listings/latest?symbol=…   -> error_code 0, data rows 1, credit_count 1
B) GET /v1/content/posts/latest?symbol=BNB           -> error_code 1006
   "Your API Key subscription plan doesn't support this endpoint."   credit_count 0
C) GET /public-api/v1/content/posts/latest?symbol=BNB -> HTTP 403 (keyless path also closed)
```

**This is a plan limit, not a defect and not a bad key** — 1006 means "your subscription doesn't support
this endpoint", while 1005 means "no key reached the API" and 1001 means "invalid key". The key is valid and
a keyed Pro API call works.

**Consequences, and none of them end the entry:**

| Requirement | Status |
|---|---|
| CMC × Atlas: "at least one live Pro API call in a core feature" | **Satisfied** by the keyed quotes call — so the verify flow must use it, and it does (`snapshotPrice` prefers keyed, falls back to keyless) |
| Atlas: "read an on-chain feed" | Satisfied, keyless |
| Ingest from CMC Community posts | **Blocked on the free plan.** Ask the CMC team for access, and use verify-by-paste, which is what `docs/demo-script.md` already specifies for the money shot |
| Backtest over real post history | **Blocked.** The labelled `data/seed.json` is the leaderboard, exactly as anticipated |

**Envelope divergence, verified side by side on the same pair:** the KEYED endpoint returns the classic
object envelope `data.BNB.quote.USD.price`, while the KEYLESS endpoint returns an array
`data[0].quotes[0].price`. Same price, two shapes on the same host. A parser written from one will fail
silently on the other — `server/cmc.ts` handles both, and a test asserts the array shape is reported as a
shape error rather than read as `undefined`.

A keyed call for two symbols cost **1 credit**, so the keyed price is cheap enough to sit inside the verify
flow rather than being a one-off screenshot.

## 2. Atlas Oracle — free feeds exist, but they are on BSC **mainnet**, and check the read policy

- Free push feeds are real and public: e.g. feed **#1164 BNBChain EWTB/USD**, tags `Crypto` + `Free`,
  Push Mode, **Network: BNB Smart Chain (BEP20)**, deviation 2.00%, heartbeat 60s, push status Active.
  Its update transactions link out to **bscscan.com/tx/...** → these are **mainnet** writes.
- Pricing page confirms it: **Free Plan $0/mo — "Try Push Mode with limited feeds on BNB Smart Chain"**.
  Paid tiers ($465/mo Starter, 5 paid feeds) are only for custom/private feeds.
- Read surface: `SingleFeed` is **fully Chainlink `AggregatorV2V3`-compatible** (so `latestRoundData()`,
  `latestAnswer()`, `decimals()` work as you'd expect); `MultiFeed` is a registry keyed by a 4-byte
  `feedId` with `fetch` / `fetchBatch` / `fetchCompact`. Interfaces are MIT at
  `github.com/oracle-atlas/push-oracle-interfaces`.
- **Read policy is the trap.** Every read function is `onlyReadAccess`, and each feed instance is either
  **whitelist** (only authorised callers, plus plain EOAs not delegated via ERC-7702) or **open-read**
  (anyone). Query `isOpenRead()` on the feed proxy before assuming a contract can read it.

### The architecture bug in your brief

> "The registry contract reads the Atlas feed itself when recording, so a stored price can be checked
> on-chain rather than taken on our word." — "Mainnet reads are free; this earns the challenge's
> mainnet bonus without spending real funds."

A `CallRegistry` deployed on **BSC testnet (chain 97) cannot read a mainnet feed**. Cross-chain reads do
not exist without a bridge or an oracle callback. Two ways out, both cheap:

1. **Deploy the registry on BSC mainnet (56)** where the free Atlas push feeds live. `recordCall` reads
   `latestRoundData()` in the same transaction, so the stored Atlas price is trustlessly verified and the
   `roundId` + `updatedAt` prove freshness. Writes cost a few cents of real BNB — this is the version that
   earns the mainnet bonus, and it is the only version where your differentiator is actually true.
2. Keep a **testnet registry for the gas-free demo** and record the Atlas `feed`, `roundId` and `updatedAt`
   **as supplied**, labelled as backend-supplied. Do not claim on-chain verification on testnet.

Two registries, one interface, is the honest and boring answer. Decision needed by T-14h.

**10-minute check to run before coding (no keys needed):**
```bash
cast call <feedProxyFrom_atlasoracle.io/feeds/NNNN> "isOpenRead()(bool)" --rpc-url https://bsc-dataseed.binance.org
cast call <feedProxy> "latestRoundData()(uint80,int256,uint256,uint256,uint80)" --rpc-url https://bsc-dataseed.binance.org
cast call <feedProxy> "description()(string)" --rpc-url https://bsc-dataseed.binance.org
```
If `isOpenRead` is `false`, the read reverts for a contract caller → either pick a different free feed, or
ask the Atlas team at the venue to whitelist your registry address, or fall back to path 2.

## 2b. Atlas — what the live contract actually answered (verified on BSC mainnet)

### CORRECTION (found by Codex round 3, verified live): the calldata, not the feedId, was wrong

This section originally concluded that "the catalogue number is not the on-chain feedId". **That was wrong.**
The real cause was malformed ABI calldata: a `bytes4` argument must be sent as a **right-padded 32-byte word**,
and the bare four bytes revert with an empty reason. Probed against
`0xeace519ebb14fb8404fa6ddd23c3b34abade44aa`:

```
decimals()                              -> 0x…12  (18)
selector + 4 bare bytes                 -> execution reverted: 0x        <-- what we shipped
selector + bytes4 padded to 32 bytes    -> a real snapshot               <-- correct
  price       = 85940244616217042600  (= $85.94 at 18dp)
  timestamps  = 1795699130            (2026-11-26T13:18:50Z, 4 seconds old at read time)
```

So **the catalogue number IS the on-chain feed id**: catalogue `#1164` is feedId `0x0000048c`, and it reads
live and keyless today. The supplier gate for a working feed is **closed** — only a *different asset's* id
(BNB, CAKE) still needs asking for.

Second defect, same file: the snapshot was read at `latest` and `eth_blockNumber` fetched separately, so the
recorded reference block could be a block the price did not come from. Every read is now pinned to one block.

The lesson worth keeping: an empty revert is not evidence about *which* argument was wrong. I inferred a
false fact about the provider from a revert that my own encoder caused, and wrote it into the docs as verified.

### What the interface actually is

Read with `eth_call` against the free feed proxy shown on `atlasoracle.io/feeds/1164`
(`0xeace519ebb14fb8404fa6ddd23c3b34abade44aa`), 2026-11-26:

```
isOpenRead()   -> 1                 (open-read: a contract MAY read it)
decimals()     -> 18
description()  -> "MultiFeed"
contractType() -> 2                 (2 == MultiFeed)
version()      -> 2
latestRoundData()                -> execution reverted      <-- it is NOT a SingleFeed
```

**Consequences:**

1. **The proxy is a MultiFeed, not a SingleFeed.** A Chainlink-style `latestRoundData()` reverts on it,
   so the brief's Chainlink mental model does not apply to the free feeds. Use
   `fetch(bytes4 feedId)` → `PriceSnapshot { uint80 price; uint48 aggregatedTs; uint48 onchainTs; }`,
   or the cheaper `fetchCompact(bytes4)` packed as
   `[Reserved 80][OnchainTs 48][AggTs 48][Price 80]` (decode with the MIT `FeedCodec` library).
2. **The catalogue number is not the on-chain feedId.** Both `0x0000048c` (1164 as a uint32) and
   `0x00001164` revert. Get the real 4-byte id from the Atlas team — they are at the venue.
   Until then the registry cannot read the feed, and neither can your smoke test.
3. **Reads are open** (`isOpenRead() == true`) on this feed, so `CallRegistry` can read it directly —
   the contract enforces this at deploy time and reverts with `FeedNotOpenRead()` otherwise.

Selectors, for when you probe by hand: `isOpenRead()` `0xba94e9ff` · `fetch(bytes4)` `0x7ffc4b97` ·
`fetchCompact(bytes4)` `0x1fa1065f` · `decimals()` `0x313ce567` · `contractType()` `0xcb2ef6f7` ·
`description()` `0x7284e416` · `latestRoundData()` `0xfeaf968c`.

The contract in this repo is written against that interface — in both the verified and referenced modes —
and compiles clean (`npx solc@0.8.24 --bin --optimize src/CallRegistry.sol`).

### You cannot discover a feedId from the contract — only Atlas can give it

Probed the live MultiFeed for an enumeration surface:

```
feedCount()  feedIds()  getFeedIds()  feeds()  getFeed(bytes4)  config(bytes4)
feedConfig(bytes4)  isFeedActive(bytes4)  getLatestPrice(bytes4)  latestAnswer(bytes4)  aggregate(bytes4)
   -> all execution reverted: 0x
```

`IMultiFeed` (the MIT interface) has **no** enumeration and no metadata-per-feed: its whole surface is
`fetch`, `fetchBatch`, `fetchCompact`, `fetchCompactBatch`, `decimals`, `description`, `version`,
`contractType`, `isAuthorizedCaller`, `isOpenRead`. Governance and price-reporting functions are omitted
deliberately. So the `feedId` per asset has to come from Atlas — the team at the venue, or their dashboard.

Diagnostic to remember: an **unknown `feedId` reverts with an empty reason** (`execution reverted: 0x`),
while a **known but never-updated feed returns a zero-initialised snapshot**. A revert means "wrong id",
not "oracle down".

## 3. Cournot — the probability needs NO API key; the key in their docs is for something else

Probed live 2026-11-26 against `https://interface.cournot.ai` (no credentials of any kind):

```
GET  /cournot/markets/public                          -> 200 {"code":4100,"msg":"slug is required"}
GET  /cournot/markets/public?slug=…&source=test        -> 200 {"code":4100,"msg":"invalid source: test"}
POST /cournot/markets/dispute/submit                   -> 200 {"code":4100,"msg":"api_key is required"}
```

**Three separate things, and only one of them is a key:**

| Surface | Auth | What it is |
|---|---|---|
| **Intelligence Oracle** (`skill.cournot.ai`) — *what this project needs* | **none to start** | An agent skill that returns the probability for a claim. **Three free calls per IP, in total, shared with divergence, no reset** — the marketing page says "per account", the skill's own billing contract says **per IP**. Then paid per call via x402 (Base) / b402 (BNB Chain). No key, no wallet to start |
| `GET /cournot/markets/public` | no key | Public settlement records. Note it wants a recognised partner `source` — `source=test` is rejected |
| `POST /cournot/markets/dispute/submit` | **`x-api-key`** | The only thing the partner key is for: **filing a dispute on behalf of an end user**. A write action. Rules: the partner's own `source` (derived from the key) must match the market's source; only `resolved` markets; one dispute per market |

So: **do not go looking for a Cournot partner key.** The `x-api-key` in the partner docs is a
prediction-market operator credential for filing disputes — irrelevant to reading a probability, and not
what the challenge asks for. The challenge asks for **one successful live call to the Intelligence Oracle
skill**, which the free tier covers exactly.

**Architectural consequence — read this before wiring the backend.** The published REST surface has **no
endpoint that returns a probability for an arbitrary claim**. Probabilities only come out of the skill,
whose client is bundled (`npx cournot-skills add Cournot-AI/cournot-skills/skills/cournot`, Node ≥ 22.20,
"all calls use the bundled client"). So "one live Cournot call per new call" cannot be a plain
`fetch()` — the backend has to drive the skill. Keep the call behind one small module so the demo path can
fall back to **recorded responses**, and spend the three free calls on: one shape-check now, one rehearsal,
one on stage.

Verified on their own site: "First release covers crypto events · **three free calls per account**", and
"the skill runs only on an explicit request — one instruction produces at most one paid call". A request
that cannot be resolved to a specific claim **stops and asks rather than guessing**, so the extractor must
emit a claim naming an asset and a threshold or a date.

- The challenge needs: one successful live call, the probability **driving a real decision**, claim +
  evidence shown verbatim, a `Cournot Integration` README section, and reproducible proof (request ID or
  sanitised log). **Develop against recorded responses; spend the real calls on the demo + the proof.**
Verified live 2026-11-26 with the bundled client (no key, no wallet, no signup):

```bash
git clone --depth 1 https://github.com/Cournot-AI/cournot-skills
node <skill-root>/scripts/cournot-client.mjs balance     # free  -> {"state":"credential_missing", "Anonymous queries remain available"}
node <skill-root>/scripts/cournot-client.mjs resolve --request-base64 <b64>   # free, no charge
node <skill-root>/scripts/cournot-client.mjs prepare --request-base64 <b64>   # the CHARGED probability call
```

`resolve` is **free** and returned real candidates in about a second, e.g. for
"BNB price above $600 before December 31, 2026":

| id | market | match confidence |
|---|---|---|
| 113195 | BNB price above $600.00 at any time before 2026-12-01 05:00 UTC | 0.823 |
| 1571 | BNB price above $1,000 at any time before 2027-01-01 05:00 UTC | 0.820 |
| 1570 | BNB price above $1,100 … before 2027-01-01 05:00 UTC | 0.818 |

**The constraint that shapes the extractor: Cournot markets are discrete strike × deadline pairs.** There is
no market for "$600 before December 31" — the nearest are *$600 before December 1 2026* and *$1,000 before
January 1 2027*. So a KOL claim can only be priced when it maps onto an existing market; otherwise the skill
stops and asks rather than guessing. Two consequences: (a) the extractor should normalise a claim onto the
nearest available strike/date, and (b) the leaderboard's Edge only exists for calls that landed on a market —
say so in the UI rather than hiding it.

Auto-proceed rule from the skill's flow reference, worth knowing for the demo path: with several candidates
you may only continue without asking a human when the leader's confidence is **≥ 0.85 and at least 0.15
ahead** of the next. The run above does not qualify, which is exactly the case a demo script must handle.

Raw client output is saved in `evidence/cournot/`.

### Outcome of the one paid attempt: `payment_choice_required` — no probability obtained

The `prepare` call for market 113195 returned:

```json
{"state":"payment_choice_required","choices":["topup","import","per_call"]}
```

Per the skill's own flow reference, that state means **the free allowance ran out** (as opposed to
`pack_exhausted`, which means prepaid calls ran out). `resolve` and `balance` are free and had already
succeeded minutes earlier, and no probability call had ever been made from this machine — so the **lifetime
per-IP free allowance was already consumed before we started**, almost certainly by another user of this
egress IP (NAT / proxy / shared connection). That is the practical consequence of "three free calls per IP"
rather than per account:

**On any shared network — a hackathon venue's wifi above all — you cannot count on the free tier. Assume
zero and plan for it.** The three routes, all equally valid:

1. **`/cournot topup`** — buy a pack. **Starter: $5 for 600 calls**, which removes this entire risk class for
   less than a coffee, and packs stack, never expire and are non-refundable. Requires a wallet that can sign
   x402 (Base) or b402 (BNB Chain) payments.
2. **Pay per query** — $0.01 for a single query, reviewed and confirmed before anything is charged. Same
   wallet requirement.
3. **`/cournot import <key>`** — use a prepaid account purchased elsewhere or on another device.

Plus the free route that actually fits this event: the challenge text says selected eligible projects
receive Cournot access, and the Cournot team is at the venue. **Ask them for hackathon credits** — it is the
cheapest option and it puts you in front of the people judging the bounty.

What remains free and verified: `resolve` (market disambiguation — real candidates, ids and
`matching_confidence` in about a second), `balance`, divergence **page turns** (re-reading a saved snapshot),
and an empty divergence ranking. Those are enough to develop and to rehearse the whole demo path against
recorded fixture data — only the probability number itself is metered.

## 4. Living Brain — early access, key + subject id

- Docs are at `docs.livingbrain.com`; append `.md` to any page for clean markdown (agent-friendly).
- Auth needs an **API key (`lbk_...`) and a `subject id`** — brains are owned by subjects. Both come from
  the org dashboard; "Now in early access".
- SDKs: `@living-brain/sdk` (TS) or `livingbrain-sdk` (Python); also a hosted **MCP server** at
  `https://livingbrain.fernmcp.dev/livingbrain` (`x-api-key`, `x-subject-id`), and a `livingbrain` CLI.
  **Hermes is a listed MCP client** — if you want the memory layer set up fast, that path is one snippet.
- Captures are **asynchronous**: `captures.capture` returns an ingest source with `status: pending`, and
  Living Brain compiles it into pages in the background — register a **webhook** rather than polling.
  Your demo must not show a spinner because a capture had not compiled yet. Pre-warm the memories.
- Free-tier limits are **not published** anywhere public. Ask at the booth; your brief already flags this.

## 5. Free-tier claims worth re-checking

- "Etherscan's API no longer has a free tier for BNB Chain" — Etherscan now runs one unified v2 API across
  chains; verify at the booth before you route around it. Public RPC + `eth_getLogs` is the safe default anyway.
- CMC Pro key, Atlas feed access and Living Brain keys are all **approval-gated**. In a 17-hour window the
  approval is the critical path, not the code.

## Sources
- `coinmarketcap.com/api/documentation/pro-api-reference/keyless-public-api.md`
- `coinmarketcap.com/api/documentation/pro-api-reference/content/content-latest-posts.md`
- `docs.atlasoracle.io/developers/atlas-oracle/integrate-the-push-mode`, `.../api-reference/single-feed-contract`, `.../multi-feed-contract`
- `atlasoracle.io/pricing`, `atlasoracle.io/feeds`, `atlasoracle.io/feeds/1164`
- `docs.livingbrain.com/llms.txt`, `docs.livingbrain.com/docs/quickstart`
- `cournot.ai/`, `github.com/Cournot-AI/cournot-skills`
