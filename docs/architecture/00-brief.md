# Brief for Codex — Proof of Alpha: repo structure and phased build plan

You are the **author** of the structure and the build plan. Another agent (Hermes) will adversarially
review your output against the repository's own evidence and the sponsor rubrics, then converge with you on
one agreed plan. Write to be attacked: every claim must be checkable against a file in this repo.

## Read these first, in this order

1. `docs/integration-findings.md` — **ground truth.** Every fact in it was verified by a live probe
   (HTTP status codes, `eth_call` results, raw JSON). Do not contradict it and do not re-derive it.
2. `README.md` — track eligibility, what is already built, what is unproven.
3. `contracts/src/CallRegistry.sol` — exists, compiles under solc 0.8.24, two modes (verified / referenced).
4. `docs/one-pager.md`, `docs/submission-checklist.md`, `docs/demo-script.md` — the judging artifacts.
5. `scripts/smoke.mjs` — the integration smoke test; currently 1/5 checks pass (keys absent).

Treat `docs/integration-findings.md` as the boundary of what is known. Anything outside it is a
**hypothesis**, and you must label it `UNVERIFIED` with the command that would verify it.

## What the project is

A credit record for crypto KOLs. A CMC Community post becomes a structured claim (asset, direction, target,
deadline); the claim is priced against the market's expectation with the Cournot Intelligence Oracle;
CMC and Atlas prices are snapshotted; all of it is committed to BNB Chain before the outcome is known; at
the deadline the call is resolved and scored. Headline metric is **Edge = outcome − Cournot probability at
posting**. Memory layer is ChatAndBuild Living Brain. Full detail in `docs/one-pager.md`.

## Hard constraints — team decisions, not up for redesign

State any objection to these in an `Objections` section, but design **within** them.

1. **Single package, plain top-level folders.** No pnpm/npm workspace, no monorepo tooling, no turbo/nx.
   One root `package.json`. Shared types live in one plain folder (e.g. `shared/`) consumed by both the
   backend and the front end via a `tsconfig` path alias.
2. **Repo**: public, MIT licence, owner `Marwanelh`, name `proof-of-alpha`.
3. **Two builders, split by vertical, not by layer:**
   - **Builder A** owns the **verify path end to end** — paste post → extract claim → Cournot probability →
     CMC + Atlas prices → on-chain receipt → explorer. This is the money shot and the bounty's proof.
   - **Builder B** owns **leaderboard + backtest + Living Brain memory**.
   Each builder must be able to demo their own slice working without the other.
4. **Money shot (the one thing that must work on stage): the live verify path.**
5. **Runtime for the demo**: localhost on the presenter's laptop. Front end *optionally* deployed to Vercel.
   **No hosted database** — a local SQLite or JSON fixture, with a first-class `seed` script.
6. **Stack**: Node 22 + TypeScript backend; Solidity contracts via Foundry (**not yet installed**);
   Next.js front end with wagmi/viem. Node 22.23.1 is present.
7. **Deadline**: HackQuest submissions close **09:00 Fri 27 Nov (UTC+7)**; Demo Night is 15:00 the same day.
   Assume roughly 14 working hours from now and two people.
8. **Cournot is metered and its free tier is already exhausted from this machine** (per-IP free calls, no
   reset — see findings §3). So: the demo must remain demonstrable **without** a live Cournot call, while at
   least one **real** live call must exist as the bounty's proof artifact. Design the boundary so a recorded
   response and a live response are interchangeable behind one interface, and the UI can honestly label
   which one the audience is seeing.

## Deliverable

Write your proposal to **`docs/architecture/PROPOSAL-codex.md`**. Touch no other file. Include exactly:

**A. Folder skeleton.** Every path, one line of purpose per path. No directory without a reason to exist.

**B. Module boundaries.** Name the 5–8 modules. For each: its single responsibility, what it takes in,
what it returns, and what it must never do. Then give the **shared types** (the claim shape, the Cournot
response shape, the Edge computation inputs) as TypeScript, in the folder from constraint 1. The boundary
between Builder A's slice and Builder B's slice must be explicit and must be a type, not a convention.

**C. Phases.** Each phase gets: entry criteria (what must already be true), exit criteria (**a command whose
output proves it**), owner (A or B), time-box, and the specific bounty requirement it ticks. Phases must be
ordered so that a working demo exists as early as possible and every later phase makes it better rather than
making it exist. Call out which phase produces the submission-ready artifact.

**D. Risk register.** Top 5 risks, each with likelihood, impact, and a **concrete** mitigation that is a
decision (not "be careful"). Include the risks that follow from the constraints — e.g. the front end and
backend sharing types without a workspace; two people editing one package concurrently; Foundry not being
installed; the Cournot metering.

**E. Cut list.** If the team is four hours behind at 03:00, rank what to cut first, and say what the demo
looks like after each cut.

## Output rules

- Concrete over comprehensive. No filler, no restating this brief.
- No invented API behaviour, no invented file paths, no invented sponsor requirements. Cite the file you got
  a fact from, or mark it `UNVERIFIED`.
- Every path you propose must appear in the skeleton in section A.
- If your plan cannot fit in ~14 person-hours × 2, say so explicitly and give the reduced plan that does.
