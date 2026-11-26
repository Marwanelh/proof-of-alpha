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
| CMC `GET /v1/content/posts/latest` (`id`/`slug`/`symbol`, paged with `last_score`) | the calls themselves | 0 credits, 5-minute cache; it is the only public feed of CMC Community posts |
| CMC quotes + historical + DEX endpoints | the posting snapshot, resolution, proxy-Edge for the backtest, wallet/swap checks | one vendor for post, price and on-chain activity, on BNB Chain |
| Atlas Oracle push feed — `fetch(bytes4 feedId)` on the MultiFeed, read over a keyless public RPC | the on-chain price in the receipt | Atlas is first-party CMC data, same venue universe; a CMC/Atlas disagreement beyond tolerance flags a low-confidence snapshot |
| Cournot Intelligence Oracle | probability of the claim at posting | it prices what the market already expected, which is the only way to separate skill from beta |
| BNB Chain `CallRegistry` | the tamper-proof receipt | the call, its probability and both prices are committed before the outcome is known |
| Living Brain | per-KOL memory and the coordinated-posting graph | answers about a KOL come from their own accumulated record |

**BNB Chain contract addresses and/or data used.** `CallRegistry` is deployed on BSC — see
`docs/addresses.md` for the live addresses. We read Atlas **directly from the chain with no key or
account**: a free public RPC call to the Atlas MultiFeed on BNB Smart Chain, `fetch(bytes4 feedId)`
returning the price with its own `aggregatedTs`/`onchainTs`. Plan A (default) records that price, the CMC
price, the claim and the Cournot probability into a **testnet** receipt, storing the mainnet block the
Atlas price was read at so anyone can re-check it against Atlas's mainnet history — the call is flagged
`atlasVerified = false`, because the testnet contract cannot read mainnet and we will not present a
referenced price as a verified one. Plan B (bonus) deploys the registry on **mainnet**, where
`recordCall()` reads the feed in the same transaction and the stored price is verified on-chain
(`atlasVerified = true`). Either way the Atlas price freshness bound (`maxAtlasAge`) is enforced, and
resolution is blocked until the call's deadline passes, so no one can settle a call early. Data used: CMC
Community posts, CMC quotes (spot + historical), CMC DEX holders/swaps, Atlas free push feeds on BNB Chain.

**Safety.** API keys exist only in the backend environment and never reach the front end or the repo. The
backend holds no user funds. Every score links to the calls and receipts behind it. Flags state facts
("wallet sold 41% within 26 minutes of the post"), never accusations, and a KOL needs a minimum number of
resolved calls before they are ranked.

**What we would build next.** Wallet verification so a KOL links a wallet to their profile; more call
sources (Telegram public channels, Binance Square when an API exists); a B2B API so launchpads can score a
promoter list before paying for it; and a copy-follow vault restricted to KOLs above an Edge threshold.
Revenue: a verified-KOL badge, a trader subscription, and B2B vetting — the record stays free to read.
