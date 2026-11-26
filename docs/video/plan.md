# Video plan — Proof of Alpha (BNB Bangkok submission)

Status: **draft for review (Codex round 1)**. Not yet built. No rendering has started.

## 0. What this video is actually for

The rubric gives **demo & presentation only 5 of 100 points**. So the video's real job is not to be
beautiful — it is to be the *evidence surface* for the other 85. A judge scoring "depth of data
integration (25)" cannot audit our code during a 3-minute watch; they watch the video. So the video must
**show the data plumbing working**, not describe it.

| Dimension | Points | What the video does about it |
|---|---|---|
| Depth of data integration | 25 | Shows **two independent price sources in one frame** (CMC keyed quote beside the on-chain Atlas feed), the block pin, the feed's own `description()`, and the Edge arithmetic in basis points on screen |
| Real-world potential | 25 | Names the three buyers (KOLs → verified badge, traders → alerts, launchpads → promoter vetting) and shows the plain-language answer written for a non-crypto reader |
| BNB Chain + RWA focus | 20 | Every read is BSC mainnet; the contract is shown; the RWA angle is the atlas MultiFeed registry of tokenized-asset feeds |
| Technical quality and safety | 15 | 118 tests, three-state provenance, no signer on the deployment, credential gate — shown as *artefacts*, not adjectives |
| Originality | 10 | "Edge = outcome − probability" and the receipt-shaped record; the honesty itself as the differentiator |
| Demo and presentation | 5 | The craft of this file: ≤3:00, legible, no dead air |

## 1. Hard constraints

- **≤ 3:00 hard limit** (`docs/submission-checklist.md` line 43, README line 164). **Target 2:00**, per the
  review: at 160 s the cut waited 45 s for its strongest proof. Overrunning is a rubric risk for zero upside;
  so is starving evidence. Both are settled by cutting exposition, never evidence.
- **1920×1080, 30 fps, 16:9.** Not vertical — this is a submission video, not a social clip.
- Resolution must survive a judge watching on a laptop at 50% size: **minimum on-screen text size 28 px at
  1080p**, code and block numbers **≥ 32 px**.
- No talking head. There is no footage of you and no time to make one. The video is screen-truth + designed
  typography.

## 2. THE HONESTY PROBLEM — read this first

This is the part that decides whether the video is a liability. As of now, the live deployment reports:

| Number | Value today | Status |
|---|---|---|
| `CallRegistry` on BSC testnet | `0x6860e45d869cb42d3552bd67aecc9d6fe4bf0360` · deploy tx `0x8a1770…b201` · block 145,032,286 · 4,950 bytes of bytecode · gasUsed 1,128,682 | **real** — verified on-chain, linkable on BscScan |
| `recordCall` receipts written | **1** — call #0, block 145,045,939, `cournotBps` 2902 | **real**, verified: 1 `CallRecorded` event, recorder nonce now 2 |
| Calls priced by Cournot | **1** of 4; the other three use a labelled proxy | real, from `/leaderboard` |
| Leaderboard rows | 3, all **sample data**, backtested, not live-resolved | true, and labelled on-page |
| CMC BNB price | `554.5424980386598`, `source: keyed` | **real**, live |
| Atlas BNB/USD price | `554591755781809163950` @18dp = **$554.59**, `singlefeed`, `description: "bnb/usd"` | **real**, live, block-pinned |
| Cournot on the receipt | `provenance: "fixture"`, probability 0.35 | **invented — must never appear as ours** |
| Tests | **137** passing, tsc 0 | real |

**Therefore the video may not show:**
1. A **receipt** transaction, a `CallRecorded` event, or the words "recorded on-chain" **unless a real
   probability exists**. The **deploy** transaction is real and should be shown — it is the contract
   existing on BNB Chain, verifiable by anyone. The distinction is: the registry is on chain; no call is
   recorded in it yet, and §2b says why.
2. Any probability attributed to Cournot. We hold one **free** `resolve` call (real: `state: complete`,
   `code: 0`, five markets, best match `#113195` at confidence 0.855) but **not** a probability — the
   probability call needs credit. On screen it is "market match, confidence 0.855", never "Cournot says X%".
3. The sample leaderboard without its label. The label `Sample data · backtested, not live-resolved` stays
   in frame whenever a row is in frame.
4. "Edge +0.38" as a measured result. It is a **proxy** edge; the row already says `proxy · not Cournot`
   and the video repeats it.

**Framing that turns this into a strength:** the honest zeros are the story. Most submissions will show a
green leaderboard full of unlabelled numbers. Ours shows a counter that says what we do *not* have. That is
the technical-quality-and-safety score (15) and the originality score (10) in one shot — *"the record tells
you which of its own numbers are real."*

### 2b. The refusal became a real receipt — and that is the better ending

An hour ago this section argued for withholding a receipt: `encodeCall` writes `cournotBps` into the
transaction and the on-chain `Call` struct carries `atlasVerified` for the price but **no provenance field for
the probability**, so writing a fixture would have burned an invented number into a permanent public record
with nothing on-chain to distinguish it.

That argument is now settled the other way, because a **real** probability arrived. At 20:48 UTC call #0 was
recorded on BSC testnet with `provenance: "recorded-live"`, `probability: 0.2902`, market `#111338`, and the
write was verified independently (`SUCCESS`, block 145,045,939, one `CallRecorded` event, recorder nonce 2).
The guard in `app/api/verify/route.ts` — a fixture run stays a draft — is what made this the *first* write
rather than the second: the only thing on chain is the call that earned it.

So the video shows **the receipt that exists**, and the integrity story moves to a different, harder place:
`atlasVerified: false`. The contract's own field says the Atlas price was **referenced** by our backend, not
read inside the transaction. Showing that flag is worth more than any claim of "verified on chain", because a
judge can check it.

The guard that made this possible is the one that was already there: `app/api/verify/route.ts` passes
`record: writeDeps !== null && mode !== "fixture"`, with the comment *"the chain is permanent and carries no
provenance label, so a synthetic number there would read as Cournot's forever"*. A fixture run therefore stays
a draft, and the only call on chain is the one that earned its place.

> Known gap, worth one line to the reviewer: that guard sits in **one caller**, not in `writeReceipt` itself,
> so `scripts/verify-demo.mjs` could still write a fixture receipt if someone set `wantChain`. Moving the
> check to the network boundary would make it unbypassable. Filed, not fixed mid-flight — a teammate is
> actively editing these files.

**Verdict (review, adopted, then overtaken by events):** the review asked for the testnet deploy beside a
genuine draft, with the recording rule explained once. We can now exceed that: show the **real receipt**. The
deployment earns the BNB credit, the write earns the on-chain credit the review said was missing, and
`atlasVerified: false` earns the safety credit by refusing to overstate itself. The blanket phrase "the
writer refuses" stays withdrawn — the guard lives in `app/api/verify/route.ts`, not in the shared encoder, so
the claim is scoped to the demo API or it is false. The wallet nonce is still cut from the video.

The gap the review named — a recorded call — is **closed**, and closed the only way it could be: with a real
Cournot probability (0.2902, market #111338), not with gas. A timely transaction would never have authorised
writing fixture data, which is why the earlier "if gas lands, re-render beat 5" contingency was deleted.

## 3. Structure — five beats in 2:00

Revision 1 opened on typography and first showed data at 0:45. The review's top finding was that the first 15
seconds therefore earned nothing toward the 70 points in the top three dimensions. Beat 1 is now the working
flow itself, and it is the money shot; every other beat supports it.

| # | Beat | Time | Serves |
|---|---|---|---|
| 1 | **Paste → receipt**: the real call #0 post, keyed CMC quote, block-pinned Atlas read, the real probability, status `RECORDED` | 0:00–0:32 | Data integration (25) + BNB (20) + demo (5), in the first impression |
| 2 | What the receipt is for: Edge, two **illustrative** worked examples, outcome pending 1 Dec | 0:32–0:50 | Originality (10) |
| 3 | One buyer, one decision: a launchpad reviewer endorses only calls whose probability is real | 0:50–1:10 | Real-world potential (25) |
| 4 | **The receipt on chain**: tx, block, `cournotBps` 2902, and `atlasVerified: false` | 1:10–1:36 | BNB (20) + technical quality and safety (15) |
| 5 | What works today, what is missing, both links | 1:36–2:00 | Close; demo (5) |

Two beats from revision 1 are **gone**, both on the review's advice: the sample leaderboard (no time to
explain a proxy, and an unexplained one is worse than none) and the plain-language answer panel (its counts
did not agree with the sample row beside it). The video no longer shows either.

## 4. Visual system

- **Palette from the product, not invented**: near-black background, warm off-white text, one accent for
  "verified" and one for "unverified/fixture".
- **Type**: the app's mono for every number, hash, address and block height; a clean grotesque for sentences.
  Monospace on data is the whole brand — a receipt is a document, and documents are set in mono.
- **Motion grammar**: no bouncy easing. Copy is *stamped*, numbers *count up once and stop*, rows *land*.
  Cuts are straight (no wipes) except one shader transition into beat 3.
- **Everything on screen is a real string from the app** — same words, same casing, same punctuation. If the
  product says `singlefeed "bnb/usd"`, the video says exactly that.

## 5. Assets to capture before building

All from the live deployment at `https://proof-of-alpha-three.vercel.app`:

1. `/` — the score-a-call form and the preview receipt (for beat 2's background).
2. A real `/api/verify` payload rendered in the receipt UI, with `singlefeed "bnb/usd"`, the CMC quote, the
   block height visible (**re-capture on the day; prices move**).
3. `/leaderboard` with the sample-data label and the two honest zeros in frame.
4. A KOL profile page + the plain-language answer (`{"action":"ask"}` in `/api/memory`).
5. `contracts/CallRegistry.sol` open at `recordCall` / the `CallRecorded` event.
6. Terminal: `npm test` → `# tests 118` / `# pass 118`, and `npx tsc --noEmit` → exit 0.

Capture as **still PNGs at 2× then downscale** (crisper than upscaling a 1× screenshot), plus one short
screen-recording only if a beat needs motion the stills cannot convey.

## 6. Production approach (HyperFrames)

- Project at `C:/Users/shell/Desktop/BNB/video`, skills installed at `.agents/skills/`.
- `npx hyperframes init . --skip-skills` → root `index.html` (1920×1080, `data-duration="160"`) hosting five
  scene sub-compositions in `compositions/`: `01-hook`, `02-formula`, `03-sources`, `04-record`, `05-close`.
- One paused GSAP timeline per scene, registered as `window.__timelines["<id>"]`. Timed elements carry
  `class="clip"`, `data-start`, `data-duration`; end states land just before the clip ends.
- Numbers as `data-var-text` variables so the render can be re-run with fresh prices without touching markup.
- Captions: **burned-in, one line, sentence case, bottom title-safe** — needed because judges watch muted.
- Audio: one music bed (royalty-free, from `/media-use`) at −18 dB under the captions, **no voiceover** unless
  Codex argues for one. Rationale: a TTS voice over 2:40 of technical claims risks sounding like every other
  AI demo, and captions already carry the words; the beats are readable at 1.5× speed.
- Render: `npx hyperframes check --json` → `snapshot --review` → `render`. FFmpeg 9.0 and Chrome are present,
  so local render works; cloud render is the fallback.

## 7. Risks

| Risk | Mitigation |
|---|---|
| Prices move between capture and render; video shows a price the judge can't reproduce | On-screen timestamps + block heights on every price; say "block 135,891,116" — a block is checkable even after the price moves |
| The capture route fails and the demo cannot be filmed | **Stop before rendering** and verify a read-only draft from the target build; never fake the interaction. The video's whole value is that the first 15 seconds are a real screen |
| Gas never lands, video has no on-chain receipt | Not a risk any more, and not a fix either: gas cannot make the probability real. Beat 4 shows the testnet deploy and the refusal, which is the honest version |
| Render fails or takes hours on a laptop | Render at 1280×720 as a timing test first, then 1080p; cloud render is the fallback path |
| The 2:00 target or the 3:00 limit | The cut list is ranked in `docs/video/codex-review-1.md`; trimmable exposition goes before any evidence hold |
| Judge asks "what's fake here?" | The labels are already in frame — `ILLUSTRATIVE INPUTS`, `sample`, `DRAFT`, `BSC TESTNET` — and the answer is the same sentence the screen says |

## 8. Definition of done

- [ ] `ffprobe` reports duration ≤ 180 s, 1920×1080, 30 fps
- [ ] Every number on screen appears in `SCRIPT.md` §"Numbers ledger" with its source and status
- [ ] No fabricated tx, no fabricated probability, sample label never cropped out
- [ ] Watched once at 50% size on a laptop: all text legible, no beat confusing without audio
- [ ] Uploaded, link added to `docs/submission-checklist.md`