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
| `recordCall` receipts written | **0** | true, and **deliberately** so — see §2b |
| Calls priced by Cournot | **0** | true; "the rest use a labelled proxy" |
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

### 2b. Why there is a deployed contract and still no receipt — the strongest beat in the video

The registry is on chain (deploy tx above, verifiable). The deployer has sent exactly **one** transaction
(nonce 1), so **no call has been recorded**, and that is now a deliberate refusal, not a missing step:

> `encodeCall` writes `cournotBps` into the transaction, and the on-chain `Call` struct carries
> `atlasVerified` for the *price* but **no provenance field for the probability** — verified by reading
> `server/registry.ts` and `contracts/src/CallRegistry.sol`. So a receipt written today would burn
> `cournotBps = 3500` from **fixture mode** into a tamper-proof public record with **nothing on chain to
> distinguish it from a real Cournot number**. Anyone reading the contract would be entitled to believe
> Cournot said 35%. We would rather ship a zero than a number that cannot be told apart from a lie.

`ENABLE_ONCHAIN_RECORD` has also been set back to `false` in `.env.local`, as belt-and-braces: the guard
now lives in **code** (`app/api/verify/route.ts` passes `record: writeDeps !== null && mode !== "fixture"`,
with the comment *"the chain is permanent and carries no provenance label, so a synthetic number there would
read as Cournot's forever"*), so a fixture run stays a draft even with recording switched on.

> Known gap, worth one line to the reviewer: that guard sits in **one caller**, not in `writeReceipt` itself,
> so `scripts/verify-demo.mjs` could still write a fixture receipt if someone set `wantChain`. Moving the
> check to the network boundary would make it unbypassable. Filed, not fixed mid-flight — a teammate is
> actively editing these files.

**Say this on screen.** It is the single most credible thing in the submission: the team that deployed the
registry is the team that declined to write to it, because the number it would hold was not real. That is
what "tamper-proof" is worth — it protects the reader from us too.

**Verdict (review, adopted):** show the **testnet deploy and a genuine draft**, and explain **once** that the
demo API excludes fixture probabilities from recording. Deployment earns the BNB credit; the refusal earns
the safety credit; a recorded call stays honestly unproven. The blanket phrase "the writer refuses" is
withdrawn — the guard lives in `app/api/verify/route.ts`, not in the shared encoder, so the claim is scoped to
the demo API or it is false. The wallet nonce is cut from the video: it is audit detail a 26-second beat
cannot afford, and it invites a question the format cannot answer.

A recorded call remains the single gap in the on-chain story, and **gas cannot close it**: a timely
transaction would not authorise writing fixture data. Only a real Cournot probability can, so the earlier "if
gas lands, re-render beat 5 with the real tx" contingency is deleted — it was wrong on its own terms.

## 3. Structure — five beats in 2:00

Revision 1 opened on typography and first showed data at 0:45. The review's top finding was that the first 15
seconds therefore earned nothing toward the 70 points in the top three dimensions. Beat 1 is now the working
flow itself, and it is the money shot; every other beat supports it.

| # | Beat | Time | Serves |
|---|---|---|---|
| 1 | **Paste → draft**: the real call, keyed CMC quote, block-pinned Atlas read, draft status | 0:00–0:32 | Data integration (25) + BNB (20) + demo (5), in the first impression |
| 2 | What the draft computes: Edge, one **illustrative** worked example | 0:32–0:50 | Originality (10) |
| 3 | One buyer, one decision: a launchpad reviewer declines to endorse pending a real probability | 0:50–1:12 | Real-world potential (25) |
| 4 | The testnet deployment, and the scoped refusal to write to it | 1:12–1:38 | BNB (20) + technical quality and safety (15) |
| 5 | What works today, what is missing, both links | 1:38–2:00 | Close; demo (5) |

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