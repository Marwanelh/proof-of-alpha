# DESIGN.md — Proof of Alpha

## Scene sentence (this is what forces the theme)

> A hackathon judge, mid-afternoon, bright conference hall, laptop at 30% screen brightness, deciding in
> 90 seconds whether this team's numbers can be trusted.

That sentence forces **light**. A dark UI on a washed-out laptop screen in daylight hides exactly the
values the product is asking to be judged on. Light is not the safe choice here; it is the only one the
scene allows.

## Design brief

```text
Designing an evidence ledger for crypto KOL calls for hackathon judges and crypto-native traders.
Goal: see, in 90 seconds, which numbers are real and which are not.
Tone: notarised public record. Precise, unexcited, checkable.
Main objection: "this looks like every other crypto dashboard, so it is probably equally unsourced."
Must remember: a receipt that looks like a receipt.
Constraints: Next.js App Router, one runtime, no component library, no Tailwind.
Research needed: styles (Refero MCP unavailable — used bundled design-system references).
Path: direct build.
```

## Reference lock

**Primary reference: HashiCorp** (enterprise restraint). Adopted: uppercase letter-spaced micro-labels as
the systematic wayfinding pattern; whisper-level shadows ("if you can see the shadow, it is too strong");
tight headings over relaxed body; 8px maximum radius, nothing pill-shaped; no pure black.

**Secondary reference: Vercel** (precision). Borrowed, bounded to two jobs: the **shadow-as-border**
technique (`0 0 0 1px rgba(…,0.08)`) instead of CSS borders, and **monospace as identity** — here sharpened
into the product's central move, since every number in this interface is a receipt line.

**Not copied:** neither canvas, neither accent system. HashiCorp's product-color system and Vercel's
workflow colors are both rejected: this product has exactly three colored states and they are semantic.

## Tokens

Neutrals tinted toward slate (hue 250) at low chroma. Never `#000`, never `#fff`.

```css
--paper:     oklch(0.984 0.004 250);  /* canvas */
--paper-2:   oklch(0.962 0.006 250);  /* recessed rows */
--ink:       oklch(0.21  0.015 250);  /* primary text */
--ink-2:     oklch(0.45  0.012 250);  /* secondary */
--ink-3:     oklch(0.62  0.010 250);  /* meta, labels */
--rule:      oklch(0.905 0.008 250);  /* hairlines */
--rule-2:    oklch(0.85  0.010 250);  /* emphasised rules */
--focus:     oklch(0.55  0.16  250);  /* focus ring only */
```

### Colour strategy: Restrained, with three semantic state colours

The states *are* the product, so they are not decoration and are exempt from the ≤10% rule. Each has exactly
one job and never appears for any other reason:

```css
--verified:   oklch(0.52 0.12 158);  /* on-chain, attestable. The stamp. */
--referenced: oklch(0.62 0.13  72);  /* referenced read, fixture, proxy score, backtested sample */
--refused:    oklch(0.54 0.17  28);  /* refused, unresolved, no baseline */
```

**Rule: a coloured state token may never be used for emphasis, branding or decoration.** If it is on screen,
it is asserting something about provenance. This is enforced by review, and it is the single most important
constraint in this document.

## Typography

- UI and prose: **Inter** (Geist on Google Fonts where available), fallback `system-ui`.
- **Every value: monospace** — Geist Mono / JetBrains Mono. Hashes, addresses, USD prices, probabilities,
  basis points, block numbers, timestamps. This is the ledger's voice and the one memorable move.
- Three weights only: 400 read, 500 interact, 600 announce. No 700.
- Negative tracking on display sizes (-0.02em to -0.03em); normal on body.
- Tabular numerals (`font-variant-numeric: tabular-nums`) on every numeric cell, so columns align and a
  reader can compare two KOLs down a column without re-reading.
- Uppercase micro-labels: 11px, weight 600, 1.2px letter-spacing, `--ink-3`.

## Layout

- Max content width 1120px, left-aligned. Not centred-and-floating.
- Rhythm varies: the register table is dense, the receipt is airy. Same padding everywhere is monotony.
- Cards used only where a card is the right affordance (the receipt, a track row). **No nested cards.**
- Nested containers are not used as decoration; most content sits on the canvas.

## Motion

- 140ms, `cubic-bezier(0.22, 1, 0.36, 1)` (ease-out-quint). No bounce, no elastic, no spring.
- Only `opacity` and `transform` animate. Never a layout property.
- Motion carries meaning: a state stamp fades in when a step completes. Nothing animates for delight alone.
- `prefers-reduced-motion` disables all of it.

## The provenance display (the core design problem)

Every provenance state is shown **in words on the surface**, in a small monospace stamp next to the value it
qualifies. Never a tooltip, never a colour alone, never an icon alone.

| State | Stamp text | Token |
|---|---|---|
| Read in-transaction from Atlas on mainnet | `ATLAS · VERIFIED` | `--verified` |
| Price read by the backend, block recorded | `ATLAS · REFERENCED @ <block>` | `--referenced` |
| Real Cournot probability | `COURNOT · <p>` | `--verified` |
| Labelled proxy baseline | `PROXY · NOT COURNOT` | `--referenced` |
| Fixture or recorded response | `FIXTURE · NOT LIVE` | `--referenced` |
| Backtested sample row | `SAMPLE` | `--referenced` |
| Real resolved call | `SETTLED` | `--verified` |
| No baseline at all | `NO BASELINE` | `--refused` |

Colour is redundant emphasis on top of those words, never the carrier of the meaning. A colour-blind reader,
a black-and-white printout and a screenshot all carry the same information.

## Absolute bans (inherited from the craft laws, kept as a refusal list)

Side-stripe borders as accents · gradient text · glassmorphism · the hero-metric template · identical card
grids · modal-as-first-thought · em dashes · pill buttons · pure `#000`/`#fff` · animation of layout
properties · a colour token used for decoration.

## Decision ledger

| Decision | Source | Role preserved | Why |
|---|---|---|---|
| Light paper canvas | scene sentence + craft rule ("dark is never a default") | canvas | A bright hall and a dim laptop screen: dark hides the values being judged |
| Neutrals tinted slate, never pure black/white | craft law | surface roles | Pure black on white in daylight glares; tinting keeps it readable |
| Monospace for every value | Vercel (mono as identity), sharpened | identity, not decoration | The values *are* receipts; verbatim rendering is the product promise |
| Uppercase micro-labels with 1.2px tracking | HashiCorp | wayfinding | Systematic field labels let a judge scan the register in seconds |
| Shadow-as-border instead of CSS borders | Vercel | border role only | Sharper hairlines on a light canvas, and rounding without clipping |
| Whisper shadows (≤0.08) | HashiCorp | elevation | Nothing should look like it floats; this product is a record, not a toy |
| Max 8px radius, no pills | HashiCorp | radius | Pills read consumer-friendly; this reads institutional |
| Three semantic state colours | user constraint (provenance is the product) + full-palette strategy | one job each | Provenance is not decoration, so it is exempt from the ≤10% accent rule |
| State names printed, not implied | user constraint + anti-slop rule | content | Colour alone fails colour-blind, print and screenshot tests |
| Tabular numerals | craft rule | typography | Comparing two KOLs down a column is the primary read |
| 560px paste field, receipt beside it | journey logic | layout | The money shot is input → receipt; they belong in one view on one screen |

## Refused

Neon-on-black, terminal-dark, gradient text, glassmorphism, hero-metric hero, identical card grids, modals,
side-stripe accents, a component library, Tailwind, and any image that cannot be checked against an artifact.
