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

- **≤ 3:00. Target 2:40, hard stop 2:55.** `docs/submission-checklist.md` line 43 and README line 164 both say
  "Demo or video ≤ 3 minutes". Overrunning is a rubric risk for zero upside.
- **1920×1080, 30 fps, 16:9.** Not vertical — this is a submission video, not a social clip.
- Resolution must survive a judge watching on a laptop at 50% size: **minimum on-screen text size 28 px at
  1080p**, code and block numbers **≥ 32 px**.
- No talking head. There is no footage of you and no time to make one. The video is screen-truth + designed
  typography.

## 2. THE HONESTY PROBLEM — read this first

This is the part that decides whether the video is a liability. As of now, the live deployment reports:

| Number | Value today | Status |
|---|---|---|
| On-chain receipts | **0** | true; no gas at the deployer, contract not deployed |
| Calls priced by Cournot | **0** | true; "the rest use a labelled proxy" |
| Leaderboard rows | 3, all **sample data**, backtested, not live-resolved | true, and labelled on-page |
| CMC BNB price | `554.5424980386598`, `source: keyed` | **real**, live |
| Atlas BNB/USD price | `554591755781809163950` @18dp = **$554.59**, `singlefeed`, `description: "bnb/usd"` | **real**, live, block-pinned |
| Cournot on the receipt | `provenance: "fixture"`, probability 0.35 | **invented — must never appear as ours** |
| Tests | 118 passing, tsc 0 | real |

**Therefore the video may not show:**
1. A transaction hash, a block explorer, or the words "recorded on-chain" **unless gas lands and a real tx
   exists before render**. If it does not land, the video shows the contract source and the deployment's
   own `NOT ON CHAIN · DRAFT` state, and says so out loud.
2. Any probability attributed to Cournot. We hold one **free** `resolve` call (real: `state: complete`,
   `code: 0`, five markets, best match `#113195` at confidence 0.855) but **not** a probability — the
   probability call needs credit. On screen it is "market match, confidence 0.855", never "Cournot says X%".
3. The sample leaderboard without its label. The label `Sample data · backtested, not live-resolved` stays
   in frame whenever a row is in frame.
4. "Edge +0.38" as a measured result. It is a **proxy** edge; the row already says `proxy · not Cournot`
   and the video repeats it.

**Framing that turns this into a strength:** the two honest zeros are the story. Most submissions will show
a green leaderboard full of unlabelled numbers. Ours shows a counter that says what we do *not* have. That is
the technical-quality-and-safety score (15) and the originality score (10) in one shot — *"the record tells
you which of its own numbers are real."*

**This is the decision I need from Codex:** is that framing enough, or does the video need to wait for gas so
it can show one real receipt? My reading: ship the honest version, and if gas lands before 09:00, re-render
scene 5 with the real tx (the scene is built to accept either).

## 3. Structure — five beats in 2:40

| # | Beat | Time | Serves |
|---|---|---|---|
| 1 | The problem, in one sentence | 0:00–0:18 | Hook; originality |
| 2 | The formula: Edge = outcome − probability | 0:18–0:45 | Originality (10) |
| 3 | **Two sources, one frame** (the money shot) | 0:45–1:35 | Data integration (25) + BNB (20) |
| 4 | The record: what it says about itself | 1:35–2:15 | Technical quality and safety (15) + real-world (25) |
| 5 | The contract, the tests, the ask | 2:15–2:40 | BNB (20) + close |

Scene 3 is where the video earns or loses its 25+20. Everything else supports it.

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
| Gas never lands, video has no on-chain receipt | Beat 5 built to show either a tx or the contract + `DRAFT` state; decided at render time, not at 08:50 |
| Render fails or takes hours on a laptop | Render at 1280×720 as a timing test first, then 1080p; cloud render is the fallback path |
| 3-minute limit | Scene 4 is the trimmable one (it is 40 s and can lose 15 s without breaking the argument) |
| Judge asks "what's fake here?" | The label is already in frame; the answer is the same sentence the screen says |

## 8. Definition of done

- [ ] `ffprobe` reports duration ≤ 180 s, 1920×1080, 30 fps
- [ ] Every number on screen appears in `SCRIPT.md` §"Numbers ledger" with its source and status
- [ ] No fabricated tx, no fabricated probability, sample label never cropped out
- [ ] Watched once at 50% size on a laptop: all text legible, no beat confusing without audio
- [ ] Uploaded, link added to `docs/submission-checklist.md`