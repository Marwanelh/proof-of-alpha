# Codex task — UX/UI for Proof of Alpha

You are the design partner on a BNB Chain hackathon project. I am building the front end now and I want a
second, independent UX/UI proposal to reconcile against mine, the same way we did the architecture round.

## Read first (in the repo, all committed)

- `docs/one-pager.md` — what the product is, one page.
- `docs/architecture/ARCHITECTURE.md` — the A/B split and the module boundaries.
- `shared/types.ts` — the data shapes the UI must render. This is the contract; do not invent fields.
- `server/verify.ts` — the single write path a UI action must call.
- `server/records.ts` — `summarise()`, `rank()`, `KolSummary`, `ScoreSummary`.
- `docs/integration-findings.md` — the live provider truth (what is real, what is a fixture, what is blocked).

## What exists

Backend and core are done and verified: 65 tests pass, `tsc` strict is clean, the Atlas read is live and
keyless, the credential gate runs pre-push. **There is no front end at all yet.** No Next.js app, no
components, no styles, nothing rendered in a browser.

## What I want from you

A **UX/UI proposal**, not code. Write it to `docs/architecture/UI-PROPOSAL-codex.md`. Be concrete and
opinionated. Sections:

1. **Screen inventory.** The minimum set of routes/screens that makes a judge understand the product in
   90 seconds, and what each one must show. Justify every screen you keep and name what you cut.
2. **The paste → receipt flow, step by step.** The user pastes a KOL post. Trace it through: what they see
   while the agent extracts, when they learn a claim could not be extracted ("nothing to prove wrong"),
   what they see when a provider is unavailable or a fixture is in use, and what the final on-chain receipt
   looks like on screen. This is the money shot; spend your effort here.
3. **How provenance is shown.** The product's credibility rests on never letting a fixture, a referenced
   price or a proxy Edge look like verified sponsor evidence. Today that is enforced in the types
   (`shared/types.ts`). Design the *visible* expression of it: what a judge sees for `atlasVerified: true`
   vs a referenced read, for a Cournot probability vs a labelled proxy, for a backtested sample row vs a
   real resolved call. It must be unmistakable, and it must not be a tooltip nobody hovers.
4. **The leaderboard.** `rank()` sorts by Cournot Edge, then hit rate, then kolId; KOLs with no Cournot
   Edge sort last by design. Design a table that makes "this KOL only has proxy-scored calls" legible and
   does not let a high hit rate imply a track record.
5. **Visual direction.** Propose a direction in words: canvas, type, accent discipline, density, one
   memorable move. Say what you would refuse. The audience is hackathon judges and crypto-native traders
   looking at a screen in a bright conference hall, and the product is an evidence ledger, not a
   trading terminal.
6. **What you would NOT build in the remaining hours**, and why.

## Constraints

- **Next.js App Router, one runtime.** No second server, no separate backend process. Route handlers are
  the API. Node 22 with TypeScript type-stripping.
- **No component library, no Tailwind.** Plain CSS with tokens is the current approach; argue if you think
  that is wrong, but any dependency you propose must earn its place in one sentence.
- **Do not invent data.** If a screen needs something the types do not carry, say so as a gap.
- **Do not fake imagery.** No stock photos, no decorative gradients standing in for a product shot.
- Judge-facing. Every claim on screen must be checkable against a real artifact.

Output: the proposal **printed to stdout**, wrapped exactly in `===BEGIN UI PROPOSAL===` and
`===END UI PROPOSAL===`. Your sandbox cannot write files and you must not try: earlier rounds confirmed no
shell, file-writing or computer-use command runs here. Do not modify any file, do not run migrations, do not
write app code. Reading the repository is expected; writing it is not.
