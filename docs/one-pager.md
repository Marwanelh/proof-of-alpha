# One-page write-up (required by the CoinMarketCap × Atlas challenge)

**Problem and audience.** Crypto influencers move prices but nobody keeps score. Wrong calls get deleted,
wins get reposted, and paid promotions are indistinguishable from conviction. CMC already shows whether a
KOL is bullish or bearish; it does not show whether they were right, or whether being right was worth
anything. Proof of Alpha is a credit record for KOLs, for the retail traders who decide whom to follow,
the honest KOLs who want a verifiable track record, and the exchanges, launchpads and data platforms that
pay creators and need to vet them.

**How it works.** A post from CMC Community is turned into a structured claim (asset, direction, target,
deadline) by an agent. The claim is priced against the market's own expectation with the Cournot
Intelligence Oracle, snapshotted against both a CMC price and an Atlas on-chain price, and written to BNB
Chain before the outcome is known. At its deadline, and at 1/7/30-day checkpoints, the call is resolved
from the same two sources and scored. The headline number is **Edge** = outcome − Cournot probability at
posting: a consensus hit earns little, a contrarian hit earns a lot, a confident miss costs a lot. History
is stored per KOL in a Living Brain memory so the agent can answer "is this person's new call worth
following?".

**Endpoints and feeds used, and why.**

| Source | Used for | Why this one |
|---|---|---|
| **Pasted posts** (`source: "paste"`) and the backfill queue (`data/backfill/posts.txt` → `npm run backfill`) | the calls themselves — claim, direction, target, deadline | CMC's content endpoints are **plan-gated on this key** (`1006 — your plan doesn't support this endpoint`), so we take the post as the user gives it rather than claim to read a feed we cannot. The backfill scores real Community posts against CMC's **historical** 5-minute quotes at posting and at deadline, and skips any post whose deadline has not passed instead of guessing it |
| CMC quotes — current and historical (`/v1/cryptocurrency/quotes/*`, keyed) | the posting snapshot, resolution, and the proxy baseline | one vendor for post, price and history, on BNB Chain; every response records `source: "keyed"` so usage is traceable |
| **Atlas SingleFeed** `0x9C0517F5b4c8657c7F18D68d2d79e2b3b1cd6438` — `latestRoundData()` and `description()`, read over a keyless public RPC and **pinned to one mainnet block** | the on-chain price in the receipt | the contract names the pair it prices (`"bnb/usd"`), so we read what it says instead of assuming an id maps to an asset. The MultiFeed (`fetch(bytes4)`) serves the tokenised-asset feeds and is what Plan B's in-transaction read uses |
| Cournot Intelligence Oracle | probability of the claim at posting | it prices what the market already expected, which is the only way to separate skill from beta |
| BNB Chain `CallRegistry` | the tamper-proof receipt | the call, its probability and both prices are committed before the outcome is known |
| Living Brain | per-KOL memory and the coordinated-posting graph | answers about a KOL come from their own accumulated record |

**BNB Chain contract addresses and/or data used.** `CallRegistry` is deployed on **BSC testnet (97)** at
`0x6860e45d869cb42d3552bd67aecc9d6fe4bf0360`
([deploy tx](https://testnet.bscscan.com/tx/0x8a1770c03320cd8343b9dbd7aaaaa318d18f6153860f3768dd34d7af6de6b201)),
and it holds a real receipt: **call #0**, `"BNB below $500 before Dec 1"`,
([record tx](https://testnet.bscscan.com/tx/0x252704994cb18087439d79462ce8ffbd1079135c71028f1aae29b901dd9a4a80)),
block 145,045,939, with `cournotBps` **2902** stored on chain. We read Atlas **directly from the chain with no
key or account**: a free public RPC call to the Atlas **SingleFeed**, `latestRoundData()` plus `description()`
returning `"bnb/usd"`, **pinned to one mainnet block** (call #0: block 135,913,072, $555.62) so anyone can
re-check it against Atlas's history. The receipt is flagged `atlasVerified = false`, because a testnet contract
cannot read a mainnet feed — the price was referenced by our backend, not read inside the transaction — and we
will not present a referenced price as a verified one. That flag is visible on the receipt rather than buried
here. Plan B (bonus) deploys the same registry on **mainnet**, where `recordCall()` reads the feed in the same
transaction and the flag becomes true. Either way the Atlas freshness bound (`maxAtlasAge`) is enforced, and
resolution is blocked until the call's deadline passes, so no one can settle a call early.

**Proof of the Cournot call.** Call #0's probability is a real `recorded-live` response for market `#111338`
(p = **0.2902**, `"BNB price below $500.00 at any time before 2026-12-01"`). The response is kept verbatim in
`evidence/cournot/success-raw.json`, and the receipt cites `sha256:c7f95d41…2c561c9b` of that file because
Cournot returns no request id. The claim it prices is the same claim recorded on chain, so the number can be
checked from both ends.

**Safety.** API keys exist only in the backend environment and never reach the front end or the repo. The
backend holds no user funds. Every score links to the calls and receipts behind it. Flags state facts
("wallet sold 41% within 26 minutes of the post"), never accusations, and a KOL needs a minimum number of
resolved calls before they are ranked.

**What we would build next.** Wallet verification so a KOL links a wallet to their profile; more call
sources (Telegram public channels, Binance Square when an API exists); a B2B API so launchpads can score a
promoter list before paying for it; and a copy-follow vault restricted to KOLs above an Edge threshold.
Revenue: a verified-KOL badge, a trader subscription, and B2B vetting — the record stays free to read.
