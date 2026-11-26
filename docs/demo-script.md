# Demo script — 3 minutes on stage (Developer Track + CMC × Atlas)

Rehearse to 2:45 so you have slack. Everything below must already be loaded, warm and logged in before
you walk up. Have the **backup recording open in a second tab**.

## 1. Hook — 20s
> "Every one of us has followed a KOL who deleted the call afterwards. CoinMarketCap tells you whether a
> KOL is bullish. Nobody tells you whether they were *right* — or whether being right was worth anything.
> We built Proof of Alpha."

## 2. Leaderboard — 40s
Show the backtested leaderboard built from CMC Community posts.
- Point at a KOL with a **high hit rate and low Edge**: "right, but only about what everyone already knew."
- Point at a **contrarian hit** with a high Edge: "this is the one worth following."
- Point at a **sell-while-shilling flag**: "wallet sold 41% within 26 minutes of their bullish post."
- Name the sample size. A judge's first question is "how many calls?"

## 3. Live verify — 60s  ← the money shot
Paste a fresh post into **Verify a call** and walk the four steps out loud:
1. "Here's the claim we extracted: asset, direction, target, deadline."
2. "Here's **Cournot** — the probability the market already assigned, with the exact claim it evaluated and
   its evidence, shown verbatim. Ours is labelled *Our note*."
3. "Here's the **CMC** price and the **Atlas** on-chain price at this moment."
4. "Record on-chain" → open the transaction on the explorer. **Read the contract address out loud.**

## 4. Memory — 30s
Open the KOL profile. Ask the agent: *"Is their new BNB call worth following?"* Show the answer drawing on
past calls from **Living Brain**, and the coordinated-posting link ("these two KOLs posted the same four
tokens within ten minutes, three times").

## 5. Close — 30s
> "The record is free to read. KOLs pay for a verified badge, traders pay for alerts, and launchpads pay to
> vette a promoter list before they spend. Proof of Alpha: a record nobody can delete."

## Failure drills — decide these now, not on stage
| If | Then |
|---|---|
| Cournot quota fails | Play the backup recording, and keep talking over it |
| Network down | Backup recording of step 3, then continue live from step 4 (memory is local-cached) |
| CMC content endpoint 403s | Switch to **Verify by pasted post** — that path needs no key |
| A capture has not compiled in Living Brain | Never open an empty profile. Pre-warm the brains and demo a KOL whose memories are compiled |
| Judge asks "what's hardcoded?" | Answer straight: the sample KOL names on the leaderboard are fictional; every receipt, price and probability shown is live |

## The 5 questions you will be asked
1. **"How do you know the KOL's wallet?"** — Only for KOLs who verify. We show the flag only where we have a
   linked wallet and say so on the flag itself.
2. **"Isn't this defamation?"** — Every score links to evidence and the original post; flags state
   observable facts with thresholds shown; KOLs can claim their profile and add context.
3. **"Where's the backtest data?"** — CMC Community posts per symbol, paged back with `last_score`; the
   window is as deep as the free plan allows and it is labelled on the leaderboard.
4. **"Why not just CMC's Social Score?"** — That tells you who is loud. This tells you who was right when
   the market disagreed, and who was selling into their own call.
5. **"What stops a KOL gaming Edge?"** — They must post a claim with a target and deadline, scored on
   everything they post, not a selection of it.
