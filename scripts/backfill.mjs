#!/usr/bin/env node
/**
 * Backtest real CMC Community posts: data/backfill/posts.txt -> data/backtest.json
 *
 *   npm run backfill                       # read with the deployed model (/api/extract), rules as fallback
 *   npm run backfill -- --rules            # rules only, no network for extraction
 *   EXTRACT_URL=http://localhost:3000/api/extract npm run backfill
 *
 * Input: blocks separated by a line of `---`. Each block starts with header lines, then the post as copied:
 *
 *   author: Alek_Carter
 *   posted: 2026-11-15 14:30          (Bangkok time unless it ends in Z or carries an offset)
 *   <the post, buttons and all>
 *
 * For each post: the claim is read as of the posting time, CMC's historical 5-minute quote gives the price at
 * posting and at the deadline, and the outcome is the price at the deadline against the claim (the same rule
 * the live resolver uses). The baseline is a PROXY from trailing 30-day volatility — labelled as such on every
 * row, never presented as Cournot. Posts whose deadline has not passed yet are skipped: an unresolved
 * backtest row would be a guess.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { cleanPastedPost } from "../shared/clean.ts";
import { extractClaim } from "../server/claim.ts";
import { directionHit } from "../server/resolve.ts";
import { proxyEdge } from "../server/records.ts";

const INPUT = process.env["BACKFILL_INPUT"] ?? "data/backfill/posts.txt";
const OUTPUT = process.env["BACKFILL_OUTPUT"] ?? "data/backtest.json";
const EXTRACT_URL = process.env["EXTRACT_URL"] ?? "https://proof-of-alpha-three.vercel.app/api/extract";
const RULES_ONLY = process.argv.includes("--rules");
const KEY = process.env["CMC_API_KEY"];
const BASE = "https://pro-api.coinmarketcap.com";

if (!KEY) {
  console.error("CMC_API_KEY is not set (.env.local)");
  process.exit(1);
}
if (!existsSync(INPUT)) {
  console.error(`${INPUT} is missing. Blocks separated by '---', each with 'author:' and 'posted:' lines.`);
  process.exit(1);
}

/* ------------------------------------------------------------------ input */

function parseTime(raw) {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T12:00:00+07:00`); // date only: midday Bangkok
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) return new Date(s.replace(" ", "T"));
  return new Date(`${s.replace(" ", "T")}${s.length <= 16 ? ":00" : ""}+07:00`);
}

const blocks = readFileSync(INPUT, "utf8")
  .split(/^\s*---\s*$/m)
  .map((b) => b.trim())
  .filter(Boolean)
  .map((b) => {
    const lines = b.split(/\r?\n/);
    const head = {};
    while (lines.length && /^\s*(author|posted|url)\s*:/i.test(lines[0])) {
      const [, k, v] = lines.shift().match(/^\s*(\w+)\s*:\s*(.*)$/);
      head[k.toLowerCase()] = v.trim();
    }
    return { head, text: lines.join("\n") };
  });

/* ------------------------------------------------------------------ CMC */

async function cmc(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { "X-CMC_PRO_API_KEY": KEY, Accept: "application/json" } });
  const body = await res.json();
  const code = Number(body?.status?.error_code ?? 0);
  if (res.status !== 200 || code !== 0) throw new Error(`${path.split("?")[0]}: HTTP ${res.status} code ${code} ${body?.status?.error_message ?? ""}`);
  await new Promise((r) => setTimeout(r, 1300)); // 50 req/min on the free plan
  return body;
}

/** The first 5-minute quote at or after `at`. */
async function priceAt(symbol, at) {
  const body = await cmc(`/v2/cryptocurrency/quotes/historical?symbol=${symbol}&time_start=${at.toISOString()}&count=1&interval=5m`);
  const q = body.data?.[symbol]?.[0]?.quotes?.[0];
  if (!q) throw new Error(`no historical quote for ${symbol} at ${at.toISOString()}`);
  return { priceUsd: String(q.quote.USD.price), observedAt: q.timestamp };
}

const dailyCache = new Map();
/** Daily closes for the 30 days before `at`, one call per asset and day. */
async function dailyBefore(symbol, at) {
  const key = `${symbol}:${at.toISOString().slice(0, 10)}`;
  if (!dailyCache.has(key)) {
    const start = new Date(at.getTime() - 31 * 86_400_000);
    const body = await cmc(`/v2/cryptocurrency/quotes/historical?symbol=${symbol}&time_start=${start.toISOString()}&time_end=${at.toISOString()}&interval=daily&count=31`);
    dailyCache.set(key, (body.data?.[symbol]?.[0]?.quotes ?? []).map((q) => q.quote.USD.price));
  }
  return dailyCache.get(key);
}

/* ------------------------------------------------------------------ proxy baseline */

function normCdf(x) {
  // Abramowitz–Stegun 7.1.26
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/** P(price on the claim's side of target at the deadline), lognormal with trailing daily volatility. */
function proxyProbability(closes, spot, target, direction, days) {
  const rets = [];
  for (let i = 1; i < closes.length; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
  const mean = rets.reduce((a, b) => a + b, 0) / Math.max(1, rets.length);
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, rets.length - 1)) || 0.03;
  const z = Math.log(target / spot) / (sd * Math.sqrt(Math.max(days, 1 / 24)));
  const pAbove = 1 - normCdf(z);
  const p = direction === "bullish" ? pAbove : 1 - pAbove;
  return { p: Math.min(0.99, Math.max(0.01, Math.round(p * 100) / 100)), sd };
}

/* ------------------------------------------------------------------ extraction */

async function readClaim(text, authorId, postedAt) {
  if (!RULES_ONLY) {
    try {
      const res = await fetch(EXTRACT_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, authorId, postedAt: postedAt.toISOString() }),
      });
      const j = await res.json();
      if (j.state === "ok") return j.claim;
      if (j.state === "refused") return null;
    } catch {
      /* fall back to the rules */
    }
  }
  const c = cleanPastedPost(text);
  return extractClaim({ text: c.text, authorId, postedAt: postedAt.toISOString(), source: "cmc", now: postedAt });
}

/* ------------------------------------------------------------------ run */

const now = new Date();
const out = [];
for (const [i, { head, text }] of blocks.entries()) {
  const label = `#${i + 1}`;
  const postedAt = parseTime(head.posted ?? "");
  const authorId = head.author || cleanPastedPost(text).author || "";
  if (Number.isNaN(postedAt.getTime()) || authorId === "") {
    console.log(`SKIP   ${label} — needs 'author:' and a valid 'posted:' line`);
    continue;
  }

  const claim = await readClaim(text, authorId, postedAt);
  if (claim === null) {
    console.log(`REFUSE ${label} ${authorId} — not a call (no coin, or no stance on its price)`);
    continue;
  }
  claim.source = "cmc";
  if (head.url) claim.sourcePostId = head.url;

  const deadline = new Date(claim.deadline);
  if (deadline.getTime() > now.getTime() - 10 * 60_000) {
    console.log(`OPEN   ${label} ${authorId} — ${claim.asset} ${claim.direction}, deadline ${claim.deadline} has not passed; skipped`);
    continue;
  }

  try {
    const atPost = await priceAt(claim.asset, postedAt);
    if (claim.targetUsd === "") {
      const p = Number(atPost.priceUsd);
      claim.targetUsd = p >= 1 ? p.toFixed(2) : p.toFixed(6);
      claim.targetSource = "price-at-posting";
    }
    const atDeadline = await priceAt(claim.asset, deadline);
    const closes = await dailyBefore(claim.asset, postedAt);
    const days = (deadline.getTime() - postedAt.getTime()) / 86_400_000;
    const { p, sd } = proxyProbability(closes, Number(atPost.priceUsd), Number(claim.targetUsd), claim.direction, days);

    const hit = directionHit(claim.direction, claim.targetUsd, atDeadline.priceUsd);
    const outcome = hit ? 1 : 0;
    const id = `cmc-${createHash("sha256").update(`${authorId}\n${claim.originalText}\n${postedAt.toISOString()}`).digest("hex").slice(0, 10)}`;

    out.push({
      kind: "backtested",
      id,
      claim,
      cmcAtPost: { priceUsd: atPost.priceUsd, observedAt: atPost.observedAt, source: "keyed" },
      proxyBaseline: {
        probability: p,
        label: "Proxy baseline — not Cournot",
        methodology: `Trailing 30-day daily volatility (σ ${(sd * 100).toFixed(2)}%/day), lognormal odds of ${claim.asset} being ${claim.direction === "bullish" ? "at or above" : "at or below"} $${claim.targetUsd} after ${days.toFixed(1)} days. CMC historical quotes.`,
      },
      resolution: {
        result: { outcome, resolvedAt: atDeadline.observedAt, cmcPriceUsd: atDeadline.priceUsd },
        score: proxyEdge(outcome, p),
      },
    });
    console.log(
      `${hit ? "HIT   " : "MISS  "} ${label} ${authorId} — ${claim.asset} ${claim.direction} $${claim.targetUsd}${claim.targetSource === "price-at-posting" ? " (price at post)" : ""}: $${Number(atPost.priceUsd).toFixed(2)} → $${Number(atDeadline.priceUsd).toFixed(2)} · proxy p ${p} · read by ${claim.extractor ?? "rules"}`,
    );
  } catch (e) {
    console.log(`ERROR  ${label} ${authorId} — ${e instanceof Error ? e.message : String(e)}`);
  }
}

writeFileSync(OUTPUT, JSON.stringify({ updatedAt: now.toISOString(), source: INPUT, count: out.length, records: out }, null, 2) + "\n");
console.log(`\n${out.length} resolved real posts -> ${OUTPUT} (from ${blocks.length} blocks)`);
