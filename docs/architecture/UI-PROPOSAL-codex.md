# Proof of Alpha — UX/UI proposal

The interface should make one promise: every strong-looking number carries its evidence class beside it. The product is not a performance dashboard; it is an audit trail that happens to rank people.

## 1. Screen inventory

### `/` — Verify a call

This is the demo and the default route. It must contain:

- Paste field for the original post.
- Required `authorId` and `postedAt` inputs. These are required by `ExtractInput`; the UI cannot silently invent them.
- One dominant action: **Check this call**.
- A claim review showing original text, asset, direction, target, deadline, and whether the horizon was defaulted.
- Cournot probability with its provenance attached directly to the number.
- CMC and Atlas snapshots with their distinct evidence status.
- A separate **Record on BNB Chain** action.
- The confirmed receipt and explorer link.

Why keep it: this is the entire hackathon story in one screen and should consume roughly the first 60 seconds of the judge walkthrough.

### `/leaderboard` — Evidence-aware ranking

A compact table showing ranked Cournot evidence first and proxy-only KOLs in a visibly separate lower cohort.

Why keep it: one receipt proves the mechanism; the leaderboard explains the product value.

### `/kol/[id]` — KOL evidence ledger

A KOL summary followed by the individual calls behind it. Every row must expose whether it is an on-chain call, an unresolved call, or a backtested proxy sample. Expanding a row reveals the claim, snapshots, baseline, resolution, and receipt where one exists.

Why keep it: this makes the leaderboard auditable instead of asking judges to trust an aggregate.

Use `kolId` as the visible identity. The current types carry no display name, handle, avatar, or verified profile.

### The 90-second path

1. Paste and submit on `/`.
2. Review the extracted claim and evidence provenance.
3. Record it and open the explorer receipt.
4. Open `/leaderboard` and point out the proxy-only lower cohort.
5. Open one KOL ledger and show the records behind its score.

### Cut

Do not build a marketing home page, onboarding, authentication, wallet connection, settings, notifications, a dedicated receipt route, a CMC post browser, or a separate “How it works” page. The verifier itself is the explanation.

The CMC Community browser is specifically inappropriate for the demo because the Content endpoint is blocked on the available free plan. Paste is the honest primary flow.

## 2. The paste → receipt flow

### Step 1 — Capture the source

The opening screen is left-aligned and direct:

> Turn a public call into evidence before the outcome is known.

The textarea label is **Original KOL post**, not “Prompt.” Beneath it are `authorId` and `postedAt`. A small static label says **Source: pasted post**.

Do not offer a CMC-source toggle until live CMC Content access exists. Do not fabricate a source URL from `sourcePostId`; the contract does not carry one.

### Step 2 — Check the claim

**Check this call** invokes `verify(..., { record: false })`.

While it runs, show one indeterminate evidence rail:

1. Checking for a scorable claim
2. Reading market evidence
3. Preparing a draft

`verify()` does not emit progress events or partial results, so future stages remain muted rather than receiving fictional checkmarks. Use a skeleton shaped like the eventual claim and evidence rows, not a spinner over an empty page.

The persistent caption is:

> Draft check only. Nothing has been written on-chain.

### Step 3 — “Nothing to prove wrong”

If extraction returns `null`, replace the pending rail with a neutral empty state—not a red system error:

> **Nothing to prove wrong yet**  
> This post does not contain one scorable call with an asset, direction, price target, and future deadline.

Keep the pasted text in place. Offer **Edit post** and **Try again**. Do not suggest a target or deadline; `server/verify.ts` explicitly refuses to invent them.

If `horizonDefaulted` is true on a valid claim, show an amber inline statement beside the deadline:

> Default horizon applied—the post did not provide an explicit date.

This must not be hidden in details.

### Step 4 — Review the draft

Render the extracted claim as a sentence first:

> **BNB bullish to $… by …**

Then show the exact fields beneath it: author ID, source, posted time, target, deadline, and original text. Direction may use an arrow, but it must also say **Bullish** or **Bearish**.

Below the claim, show two evidence bands:

- **Market expectation:** Cournot probability, evaluated claim, evidence text, and provenance.
- **Posting snapshot:** CMC price and Atlas feed read, each with source and timestamps.

The draft status remains prominent: **Not on-chain**.

### Step 5 — Provider failure

A provider failure stops the flow before a receipt. The page should preserve the source input and show:

> **Verification stopped—no transaction was sent.**

Then name the unavailable stage only when the route handler can safely identify it: Cournot, CoinMarketCap price, Atlas read, or BNB Chain confirmation. Offer **Retry**.

Never silently replace an unavailable live provider with a fixture or recorded result. Switching evidence modes must be explicit before the run.

There is a contract gap here: the shared types define successful records but no structured, client-safe error or progress envelope. Until that exists, the UI can reliably show only a coarse failure state. It must not parse arbitrary exception text into authoritative stage labels.

### Step 6 — Fixture and recorded-live modes

If Cournot provenance is `fixture`, place a full-width amber band above the probability:

> **SIMULATION — COURNOT FIXTURE**  
> This probability is synthetic and is not sponsor evidence. Fixture ID: …

Repeat **Fixture** beside the probability and beside the record action. The action becomes **Record demo receipt**, with the permanent warning:

> The transaction will be real; its Cournot input will not be real evidence.

If provenance is `recorded-live`, say:

> **Recorded live Cournot response**  
> A previously captured real response, request ID …

Do not call it a current live read. It is sponsor-eligible according to the type guard, but the schema has no capture timestamp, so the UI cannot claim when it was captured.

If provenance is `live`, show **Live Cournot evidence** and its request ID directly beside the probability.

### Step 7 — Record

The primary write action is **Record on BNB Chain**. While pending:

> Re-checking sources and waiting for transaction confirmation.

Do not say “receipt created” until `verify()` returns a confirmed transaction. Do not show confetti or a success state for a submitted-but-unconfirmed hash.

The current preview/write contract has an important limitation: `record: true` reruns extraction and all reads rather than accepting the previously reviewed draft. The final returned record is therefore canonical, and the UI should compare its claim fields with the preview and disclose if they changed. A truly frozen review-before-write flow would need a backend draft identifier or hash; that field does not exist today.

### Step 8 — The receipt money shot

On confirmation, the evidence rail should visually lock into a receipt occupying most of the viewport.

Header:

- **Receipt confirmed**
- **BNB Smart Chain Mainnet** for chain 56 or **BNB Smart Chain Testnet** for chain 97
- Call ID
- Explorer action derived from `chainId` and `txHash`

Receipt body:

1. **Claim committed**
   - Original text
   - Author ID
   - Asset, direction, target, deadline
   - Posted time and default-horizon status

2. **Cournot baseline**
   - Probability as a percentage
   - Provenance label
   - Evaluated claim verbatim
   - Evidence verbatim
   - Request ID or fixture ID, never both

3. **CMC snapshot**
   - Decimal price string
   - Observed time
   - `keyed` or `keyless` when present
   - Request ID when present

4. **Atlas snapshot**
   - Feed address and feed ID
   - Price formatted using `price` and `decimals`, with the raw value available inline
   - Aggregated and on-chain timestamps
   - Mainnet block

5. **Chain receipt**
   - Registry address
   - Transaction hash
   - Call ID
   - Atlas verification status

6. **Outcome**
   - **Awaiting deadline** because newly verified records have `resolution: null`

For `atlasVerified: true`, use:

> **ATLAS READ VERIFIED IN THIS TRANSACTION**

For `atlasVerified: false`, use:

> **REFERENCED ATLAS READ — NOT VERIFIED BY THIS TRANSACTION**  
> Read from Atlas mainnet at block …

The second message must remain directly above the explorer button so the existence of a real transaction cannot visually launder a referenced read into verified Atlas evidence.

Do not label the Atlas price as the claim asset’s price or compare it numerically with CMC yet. `AtlasSnapshot` carries a feed ID and address but no asset pair or description, and `readAtlas()` does not receive the claim symbol. That is a data-contract gap.

## 3. How provenance is shown

Provenance is a first-class line of content, never a tooltip, hover state, tiny icon, or color alone.

| State | Visible treatment | Forbidden implication |
|---|---|---|
| Atlas `atlasVerified: true` | Solid status strip: **Verified in transaction**, followed by feed ID and chain | “Live” without saying what was verified |
| Atlas `atlasVerified: false` | Hatched amber strip: **Referenced mainnet read—not transaction-verified** | Green checkmark beside “Atlas” |
| Cournot `live` | **Live Cournot evidence**, request ID beside probability | Hiding the request ID in details |
| Cournot `recorded-live` | **Recorded live response**, request ID beside probability | Calling it live now |
| Cournot `fixture` | Full-width **Simulation / fixture** band, fixture ID repeated beside probability and action | Sponsor logo treatment or evidence checkmark |
| Verified, unresolved call | **On-chain call · awaiting deadline**, explorer link | Showing an Edge value |
| Verified, resolved call | **On-chain call · resolved**, Cournot Edge and receipt | Calling it verified sponsor evidence if its Cournot input was a fixture |
| Backtested record | **Backtest sample · proxy baseline**, methodology visible | Explorer action or “verified call” copy |

A backtest row should literally say **No receipt—sample row** in the receipt column. Empty space is too ambiguous.

The provenance spine uses text, border pattern, and status color together. Green means verified, amber means referenced or synthetic, and gray means unresolved. Red is reserved for a stopped operation, not a bad investment outcome.

## 4. The leaderboard

The table should use these columns:

| Column | Treatment |
|---|---|
| Rank | Ordinal only when `cournotEdge` is non-null; otherwise **Proxy-only** |
| KOL | `kolId`; no invented display identity |
| Cournot Edge | Largest numeric column and primary sort signal |
| Evidence mix | `N Cournot / N proxy / N open` |
| Hit rate | Labelled **All resolved calls** because the summary combines both score kinds |
| Proxy Edge | Secondary, always labelled **Proxy Edge—not Cournot** |
| Mean return | Neutral secondary metric; never part of rank |

Above the table, state the algorithm in one sentence:

> Ranked by mean Cournot Edge, then hit rate, then KOL ID. KOLs without Cournot Edge appear after the ranked cohort.

Rows with `cournotCalls === 0` receive a persistent band:

> **Proxy-only history—no Cournot-ranked calls**

Their Cournot Edge cell reads **Not ranked**, never `0`, and their high hit rate uses neutral ink rather than success green. This prevents an impressive percentage from masquerading as an evidence-backed track record.

The evidence-mix column is more important than a generic “sample size” column because ten proxy calls and ten Cournot calls are not equivalent.

Do not claim a minimum eligibility threshold or scoring window. `rank()` does not enforce a minimum, and `KolSummary` carries no window. Those are currently product assertions without a UI data contract.

On `/kol/[id]`, use the same labels in the underlying call ledger. Default order should be newest `postedAt` first, while leaderboard rank remains exclusively controlled by `rank()`.

## 5. Visual direction

### Direction: public evidence ledger

Use a bright, paper-like canvas with dark ink:

- Canvas: warm off-white, approximately `#F4F1E8`
- Ink: charcoal, approximately `#171713`
- Muted text: neutral gray
- Rules: visible mid-gray, not faint hairlines
- Primary accent: BNB yellow, reserved for actions and the receipt’s chain seam
- Semantic green, amber, and red only for evidence state, always paired with words

Use the system sans-serif stack for prose and `ui-monospace` for prices, probabilities, timestamps, IDs, addresses, and hashes. No font dependency earns its place this late.

Density should be medium: generous spacing around the paste flow, then compact ledger rows once evidence exists. Prefer ruled sections and whitespace over a dashboard full of floating cards.

The memorable move is a vertical **evidence spine** running from original post to claim, market expectation, price snapshots, and chain receipt. On confirmation, the spine terminates in the transaction hash. It makes the causal sequence visible without diagrams or decorative imagery.

Motion should be limited to short status transitions and the receipt locking into place. Respect reduced-motion settings. No perpetual animation is appropriate for an evidence product.

Plain CSS with tokens is the right choice. There is no need for Tailwind, a component library, an icon package, or an animation dependency. Native controls, text labels, borders, and a few inline SVG primitives are sufficient.

The design-taste pass influenced the asymmetric evidence spine, single-accent discipline, restrained card use, and explicit loading, empty, error, and confirmed states.

### Refuse

I would refuse:

- Neon terminal styling, glass panels, glows, or decorative gradients.
- Candlestick charts or fake live price tickers.
- Stock crypto imagery, coins floating in space, mascots, and sponsor-logo wallpaper.
- Confetti after a transaction.
- Green/red as the only carrier of meaning.
- Provenance hidden in tooltips.
- Metric cards that elevate hit rate above evidence quality.
- A wallet-connect button when the product neither holds funds nor needs the judge’s wallet.
- “AI verified” language; the agent extracts, while evidence sources and the chain establish the record.

## 6. What I would not build in the remaining hours

- **CMC post discovery:** blocked on the available plan; paste is real and sufficient.
- **Living Brain chat or relationship graph:** asynchronous, approval-gated, and absent from the shared UI contract. A fake or stale demo would weaken credibility.
- **Charts:** the small and mixed-provenance sample would look more authoritative than it is.
- **Editable extracted claims:** this creates authorship and receipt-integrity questions without an agreed backend contract.
- **Streaming provider progress:** `verify()` does not expose stage events. Honest indeterminate progress is enough.
- **A separate receipt-detail route:** the receipt belongs at the climax of `/` and in expandable KOL rows.
- **Search, pagination, saved filters, exports, social sharing, PDF receipts, themes, or notification systems:** none helps a judge verify the core claim in 90 seconds.
- **Custom avatars or KOL profiles:** the data carries only `kolId`.
- **A source-post link:** there is no reliable source URL in the contract.
- **A CMC-versus-Atlas divergence score:** the Atlas schema lacks the feed’s asset pair, so such a comparison could be false.

Keep basic responsive behavior, keyboard access, visible focus, semantic tables, sufficient contrast, and non-color status labels; accessibility is part of the minimum, not a later feature.

Scope note: I did not design implementation components or add fields beyond the committed contracts.

Risk: structured client-safe errors, a frozen preview-to-write handoff, Atlas feed identity, ranking window, and minimum-call eligibility remain backend/data-contract gaps.
