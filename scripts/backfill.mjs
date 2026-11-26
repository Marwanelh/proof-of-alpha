#!/usr/bin/env node
/**
 * Backtest real CMC Community posts: data/backfill/posts.txt -> data/backtest.json
 *
 *   npm run backfill                       # read with the deployed model (/api/extract), rules as fallback
 *   npm run backfill -- --rules            # rules only, no network for extraction
 *   npm run backfill -- --horizon-hours 168   # score undated posts at 7 days instead of 24 hours
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
/**
 * A post that names no deadline is scored at this mark (default 24 hours, override with --horizon-hours N).
 * Trackers score undated calls at fixed marks (1d / 7d / 30d); 24h is the shortest and lets yesterday's posts
 * count. Every such row says so in its methodology. A deadline the author wrote is always used as written.
 */
const hArg = process.argv.indexOf("--horizon-hours");
const DEFAULT_MARK_HOURS = hArg >= 0 ? Number(process.argv[hArg + 1]) : 24;
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

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * The CMC footer under every copied post: "Alek Carter" / "@Alek_Carter" / "· Nov 23" (or "· 5h", "· 2d").
 * CMC shows only the day for older posts, so the time is taken as 12:00 Bangkok and the row says so.
 */
function footerDate(raw) {
  const s = raw.trim().toLowerCase();
  const rel = s.match(/^(\d+)\s*(m|h|d)$/);
  if (rel) {
    const ms = Number(rel[1]) * (rel[2] === "m" ? 60_000 : rel[2] === "h" ? 3_600_000 : 86_400_000);
    return { at: new Date(Date.now() - ms), dayOnly: rel[2] === "d" };
  }
  const md = s.match(/^([a-z]{3})[a-z]*\.?\s+(\d{1,2})(?:,\s*(\d{4}))?$/);
  if (!md || MONTHS.indexOf(md[1]) < 0) return null;
  const year = md[3] ? Number(md[3]) : new Date().getUTCFullYear();
  const mm = String(MONTHS.indexOf(md[1]) + 1).padStart(2, "0");
  const dd = md[2].padStart(2, "0");
  return { at: new Date(`${year}-${mm}-${dd}T12:00:00+07:00`), dayOnly: true };
}

function parseInput(text) {
  const lines = text.split(/\r?\n/).filter((l) => !/^\s*#/.test(l));
  const joined = lines.join("\n");
  // Header format: blocks separated by '---', each starting with author:/posted: lines.
  if (/^\s*---\s*$/m.test(joined) || /^\s*(author|posted)\s*:/im.test(joined)) {
    return joined
      .split(/^\s*---\s*$/m)
      .map((b) => b.trim())
      .filter(Boolean)
      .map((b) => {
        const ls = b.split(/\r?\n/);
        const head = {};
        while (ls.length && /^\s*(author|posted|url)\s*:/i.test(ls[0])) {
          const [, k, v] = ls.shift().match(/^\s*(\w+)\s*:\s*(.*)$/);
          head[k.toLowerCase()] = v.trim();
        }
        const postedAt = parseTime(head.posted ?? "");
        return { author: head.author ?? "", postedAt, dayOnly: /^\d{4}-\d{2}-\d{2}$/.test((head.posted ?? "").trim()), url: head.url, text: ls.join("\n") };
      });
  }
  // CMC copy format: name, @handle, "· <date>" around each post. Copied from a profile page the header comes
  // first ("BuySome_BTC / @BuySome_BTC / · 7h / post"); selected from the feed it can trail the post. The order
  // is decided by what the file starts with.
  const nonEmpty = lines.map((l) => l.trim()).filter(Boolean);
  const headerFirst =
    nonEmpty.length > 2 && /^@[A-Za-z0-9_.]{2,32}$/.test(nonEmpty[1]) && /^·\s*\S/.test(nonEmpty[2]);
  if (headerFirst) {
    const posts = [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i].trim();
      const next = lines.slice(i + 1).map((x) => x.trim()).filter(Boolean);
      if (l && /^@[A-Za-z0-9_.]{2,32}$/.test(next[0] ?? "") && /^·\s*\S/.test(next[1] ?? "")) {
        const handleIdx = lines.findIndex((x, j) => j > i && x.trim() === next[0]);
        const dotIdx = lines.findIndex((x, j) => j > handleIdx && x.trim() === next[1]);
        const when = footerDate(next[1].replace(/^·\s*/, ""));
        posts.push({ author: next[0].slice(1), postedAt: when ? when.at : new Date(NaN), dayOnly: when?.dayOnly ?? true, body: [] });
        i = dotIdx;
      } else if (posts.length > 0) {
        posts[posts.length - 1].body.push(lines[i]);
      }
    }
    return posts.map(({ body, ...p }) => ({ ...p, text: body.join("\n") }));
  }

  const out = [];
  let cur = [];
  for (const line of lines) {
    const dot = line.match(/^\s*·\s*(.+?)\s*$/);
    const prev = [...cur].reverse().find((l) => l.trim() !== "");
    if (dot && prev && /^\s*@[A-Za-z0-9_.]{2,32}\s*$/.test(prev)) {
      const when = footerDate(dot[1]);
      const body = [...cur];
      while (body.length && body[body.length - 1].trim() === "") body.pop();
      const handle = body.pop().trim().slice(1);
      if (body.length && body[body.length - 1].trim().length <= 32) body.pop(); // display name
      out.push({ author: handle, postedAt: when ? when.at : new Date(NaN), dayOnly: when?.dayOnly ?? true, text: body.join("\n") });
      cur = [];
    } else {
      cur.push(line);
    }
  }
  return out;
}

const blocks = parseInput(readFileSync(INPUT, "utf8"));

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

function normCdf(z) {
  // Φ(z) = (1 + erf(z/√2)) / 2, erf by Abramowitz–Stegun 7.1.26
  const x = z / Math.SQRT2;
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
    // Free models occasionally refuse a post they read correctly a minute ago. A refusal is retried twice;
    // the first reading that finds a call is used, and the checks in /api/extract still apply to it.
    let refusals = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(EXTRACT_URL, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text, authorId, postedAt: postedAt.toISOString() }),
        });
        const j = await res.json();
        if (j.state === "ok") return j.claim;
        if (j.state === "refused") refusals += 1;
      } catch {
        /* retry, then fall back to the rules */
      }
    }
    if (refusals > 0) return null;
  }
  const c = cleanPastedPost(text);
  return extractClaim({ text: c.text, authorId, postedAt: postedAt.toISOString(), source: "cmc", now: postedAt });
}

/* ------------------------------------------------------------------ run */

const now = new Date();
const out = [];
for (const [i, { author, postedAt, dayOnly, url, text }] of blocks.entries()) {
  const label = `#${i + 1}`;
  const authorId = author || cleanPastedPost(text).author || "";
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
  if (url) claim.sourcePostId = url;

  if (claim.horizonDefaulted) {
    claim.deadline = new Date(postedAt.getTime() + DEFAULT_MARK_HOURS * 3_600_000).toISOString();
  }
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
        methodology: `Trailing 30-day daily volatility (σ ${(sd * 100).toFixed(2)}%/day), lognormal odds of ${claim.asset} being ${claim.direction === "bullish" ? "at or above" : "at or below"} $${claim.targetUsd} after ${days.toFixed(1)} days. CMC historical quotes.${claim.horizonDefaulted ? ` The post named no deadline, so it is scored at the ${DEFAULT_MARK_HOURS}-hour mark.` : ""}${dayOnly ? " CMC shows only the posting day, so the post is priced at 12:00 Bangkok that day." : ""}`,
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

// Results accumulate: a post scored on an earlier run is kept even if this run's model refused it, so one
// unlucky run cannot erase reviewed data. --fresh starts over.
if (!process.argv.includes("--fresh") && existsSync(OUTPUT)) {
  const prev = JSON.parse(readFileSync(OUTPUT, "utf8")).records ?? [];
  const have = new Set(out.map((r) => r.id));
  const kept = prev.filter((r) => !have.has(r.id));
  if (kept.length > 0) console.log(`kept ${kept.length} post(s) scored on an earlier run: ${kept.map((r) => `${r.claim.authorId}/${r.claim.asset}`).join(", ")}`);
  out.push(...kept);
}
out.sort((a, b) => a.claim.postedAt.localeCompare(b.claim.postedAt));
writeFileSync(OUTPUT, JSON.stringify({ updatedAt: now.toISOString(), source: INPUT, count: out.length, records: out }, null, 2) + "\n");
console.log(`\n${out.length} resolved real posts -> ${OUTPUT} (from ${blocks.length} blocks)`);
