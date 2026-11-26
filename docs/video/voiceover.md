# Voiceover transcript for ElevenLabs

Record each scene as its own MP3 so the video can be cut to the audio instead of guessing timings.
Name them `s01.mp3` … `s11.mp3` and drop them in `vocals/`. If you'd rather do one take, read it
straight through — the scene breaks are only pauses, never new paragraphs to announce.

**Guide only:** the [bracket] notes are for you, not for the reader. Don't paste them.

## Which voice to pick

| Priority | ElevenLabs voice | Why |
|---|---|---|
| **1st — use this** | **Daniel** (British, deep, news-anchor) | Reads like a documentary narrator, not an ad. Authority is what a judge scoring "technical quality" is listening for, and a British news read makes on-chain details sound like facts rather than hype. |
| 2nd — warmer | **Brian** (American, deep, conversational) | Better if you want it to feel like a founder talking, less like a broadcast. Slightly more casual, still credible. |
| 3rd — female | **Sarah** (American, calm, professional) | Neutral and clear; good if the room already knows you and the voice should feel less "corporate". |

**Settings** (ElevenLabs): model **Eleven Multilingual v2** · **Stability 45** · **Similarity 80** ·
**Style 10** · **Speed 1.0**. Do *not* crank Style — expressive voices oversell technical claims and
it sounds like a token launch. If a take wobbles, raise Stability to 55 before regenerating.

**Numbers:** write them as you'd say them. ElevenLabs reads `$553.92` as "dollars five hundred
fifty-three point nine two", which sounds wrong. The script below already spells the spoken form;
the exact decimals live on screen, where they belong.

---

## S01 · Hook — 11 s

> Everyone in crypto has a favourite influencer. Almost nobody can prove they were right. This is
> Proof of Alpha — a scorecard for trading calls that nobody can edit.

## S02 · The claim — 16 s

> Paste any call from CoinMarketCap Community. The agent reads it and pulls out four things: the
> asset, the direction, the target, and the deadline. If a post contains no actual claim, it says
> so, instead of guessing one.

## S03 · The price at posting — 14 s

> Now the evidence. CoinMarketCap's keyed API gives the price when the call went out: five hundred
> and fifty-three dollars. That is the number the call has to beat.

## S04 · The on-chain price — 16 s

> Atlas reads the same asset directly on BNB Chain, at one specific block. Anyone can go back and
> check that block later. Two sources, two timestamps, both printed on the receipt.

## S05 · The baseline — 15 s

> Here's where most scorecards start lying. The market's own odds. A volatility model puts this
> call at sixty-four percent. It's a proxy, not Cournot — and the receipt says exactly that, on the
> number itself.

## S06 · Edge — 15 s

> Edge is the outcome, minus the probability. Right about something the market already expected?
> You earn almost nothing. Right about something it doubted? That is what alpha actually looks
> like.

## S07 · The board — 18 s

> Which is how the leaderboard ranks them. Eight real calls from CMC Community, three KOLs, scored
> against real prices. Every row that used a proxy is labelled. One call has a real market
> probability — and that one is on chain.

## S08 · The reviewed call — 22 s

> This is DemoBear. BNB below five hundred dollars by the first of December. Cournot priced it at
> twenty-nine percent. The claim, both prices and that probability are locked into a contract on
> BNB Chain — before the outcome exists.

## S09 · The chain — 15 s

> One transaction. The probability stored in basis points, and a flag saying the Atlas price was
> referenced, not verified inside the transaction. Because it was. The record does not overstate
> itself.

## S10 · Who it's for — 15 s

> A launchpad uses this to vet a promoter before paying for a campaign: it can see which of their
> calls rest on a real market probability, and which rest on a proxy.

## S11 · Close — 18 s

> The outcome settles on the first of December. Until then, the edge stays blank. That's the
> product — a record that tells you which of its own numbers are real. Proof of Alpha.

---

**Total: 175 s of video, 372 spoken words** — about 2.4 words per second, which leaves room for the
numbers to land on screen without a gap long enough to feel dead.

## What happens when you send the audio back

1. I measure each file's real duration with `ffprobe` and re-time the scenes to the audio, rather
   than forcing the audio to a fixed 175 s. The film's length becomes whatever the narration is.
2. Any scene that runs long gets its static hold trimmed, never its evidence.
3. I re-cut every screenshot crop so no pill, nav bar or card is sliced, and put all panels on one
   shared grid (same x, same width, same border) so cuts stop jumping.
4. I add the motion this version lacks: counts that tick up, rows that land one at a time, a
   punch-in that follows the number being spoken, and a highlighted row that tracks the voice.
5. Then `check` must return 0 errors, and I read frames out of the encoded MP4 again before
   calling it done — that's how the scene-4 collision was caught last time.