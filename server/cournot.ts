/**
 * Cournot adapter — one interface over three provenances.
 *
 * A fixture, a recorded real response and a live call all normalise to CournotResponse, so the demo
 * path never depends on a metered vendor being available. The distinction is preserved in the returned
 * `provenance` discriminant and is not cosmetic: only "live" and "recorded-live" may be presented as
 * sponsor evidence, and the shared type makes a fixture unable to carry a requestId.
 *
 * Adding a real call replaces data/cournot-fixture.json through this same function. Nothing downstream
 * changes.
 *
 * NOTE: add `import "server-only"` here once the Next app lands (that package arrives with Next).
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";

import type { Claim, CournotResponse, FixtureCournotResponse, ProvenCournotResponse } from "../shared/types.ts";

export type CournotMode = "live" | "recorded-live" | "fixture";

export const FIXTURE_PATH = "data/cournot-fixture.json";
export const RECORDED_PATH = "evidence/cournot/success.json";

export class CournotError extends Error {}

/** The exact client invocation, from docs/integration-findings.md §3. Printed verbatim, never guessed at. */
export function liveCommandHint(claim: Claim): string {
  const message = `${claim.asset} price ${claim.direction === "bullish" ? "above" : "below"} $${claim.targetUsd} before ${claim.deadline.slice(0, 10)}`;
  return [
    "node <cournot-skill>/scripts/cournot-client.mjs resolve  --request-base64 <b64 of {\"message\":\"…\",\"limit\":5}>",
    `node <cournot-skill>/scripts/cournot-client.mjs prepare --request-base64 <b64 of {"message":"${message}","market_ids":["<id>"]}>`,
  ].join("\n");
}

export function readCournot(mode: CournotMode, skillDir?: string, claim?: Claim): CournotResponse {
  switch (mode) {
    case "fixture":
      return readFixture(FIXTURE_PATH);
    case "recorded-live":
      return readRecorded(RECORDED_PATH);
    case "live":
      throw new CournotError(
        [
          "live mode is driven through the bundled Cournot client, not a fetch()",
          `set COURNOT_SKILL_DIR and run, for claim: ${claim ? claim.asset : "<claim>"}`,
          liveCommandHint(
            claim ?? {
              source: "paste",
              authorId: "",
              originalText: "",
              postedAt: "",
              asset: "BNB",
              direction: "bullish",
              targetUsd: "0",
              deadline: "",
              horizonDefaulted: false,
            },
          ),
          skillDir ? `skill dir configured: yes` : "skill dir configured: no",
        ].join("\n"),
      );
  }
}

export function readFixture(path: string = FIXTURE_PATH): FixtureCournotResponse {
  const raw = readJson(path);
  const p = requireProbability(raw["probability"], path);
  const evaluatedClaim = requireText(raw["evaluatedClaim"], "evaluatedClaim", path);
  const evidence = requireText(raw["evidence"], "evidence", path);
  const fixtureId = requireText(raw["fixtureId"], "fixtureId", path);
  if ("requestId" in raw && raw["requestId"] !== null && raw["requestId"] !== undefined) {
    // A fixture carrying a request id is how a synthetic number gets presented as a real call.
    throw new CournotError(`${path}: a fixture must not carry a requestId`);
  }
  return { provenance: "fixture", fixtureId, probability: p, evaluatedClaim, evidence };
}

export function readRecorded(path: string = RECORDED_PATH): ProvenCournotResponse {
  if (!existsSync(/* turbopackIgnore: true */ path)) {
    throw new CournotError(
      `${path} does not exist yet — the official client has not returned a successful response.\n${liveCommandHint({
        source: "paste",
        authorId: "",
        originalText: "",
        postedAt: "",
        asset: "BNB",
        direction: "bullish",
        targetUsd: "0",
        deadline: "",
        horizonDefaulted: false,
      })}`,
    );
  }
  const raw = readJson(path);
  const probability = requireProbability(raw["probability"], path);
  const evaluatedClaim = requireText(raw["evaluatedClaim"], "evaluatedClaim", path);
  const evidence = requireText(raw["evidence"], "evidence", path);
  const requestId = requireText(raw["requestId"], "requestId", path);
  return { provenance: "recorded-live", requestId, probability, evaluatedClaim, evidence };
}

function readJson(path: string): Record<string, unknown> {
  if (!existsSync(/* turbopackIgnore: true */ path)) throw new CournotError(`${path} is missing`);
  try {
    const parsed: unknown = JSON.parse(readFileSync(/* turbopackIgnore: true */ path, "utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new CournotError(`${path} must contain a JSON object`);
    }
    return parsed as Record<string, unknown>;
  } catch (e) {
    if (e instanceof CournotError) throw e;
    throw new CournotError(`${path} is not valid JSON: ${String(e)}`);
  }
}

function requireProbability(v: unknown, path: string): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1) {
    throw new CournotError(`${path}: probability must be a finite number in [0, 1], got ${String(v)}`);
  }
  return v;
}

function requireText(v: unknown, field: string, path: string): string {
  if (typeof v !== "string" || v.trim() === "") {
    throw new CournotError(`${path}: ${field} must be a non-empty string`);
  }
  return v;
}

/**
 * Does a recorded Cournot response price THIS claim? A recorded response is one real call about one market
 * ("BNB price below $500.00 … before 2026-12-01"). Pinning it to every pasted post would show a real
 * probability for a claim nobody asked Cournot about, so it applies only when coin, side and strike match.
 */
const ASSET_NAMES: Record<string, string> = {
  bitcoin: "BTC", btc: "BTC", ethereum: "ETH", ether: "ETH", eth: "ETH", solana: "SOL", sol: "SOL",
  bnb: "BNB", xrp: "XRP", dogecoin: "DOGE", doge: "DOGE", cardano: "ADA", ada: "ADA", chainlink: "LINK",
  link: "LINK", tron: "TRX", trx: "TRX", cake: "CAKE", pancakeswap: "CAKE",
};

/**
 * Read a Cournot market title into coin, side and strike. Handles the shapes Cournot returns:
 * "Bitcoin price above $62,500 at any time before …", "BNB price below $500.00 …",
 * "Will the price of Ethereum be above $1,900 on December 1?", "… be less than $1,200 …".
 */
export function parseMarket(
  title: string,
): { asset: string; side: "bullish" | "bearish"; strike: number; deadline: string | null } | null {
  const lower = title.toLowerCase();
  const word = Object.keys(ASSET_NAMES).find((n) => new RegExp(`\\b${n}\\b`).test(lower));
  const m = lower.match(/\b(above|over|greater than|below|under|less than)\s*\$\s?([\d,]+(?:\.\d+)?)/);
  if (!word || !m) return null;
  return {
    asset: ASSET_NAMES[word]!,
    side: /above|over|greater/.test(m[1]!) ? "bullish" : "bearish",
    strike: Number(m[2]!.replace(/,/g, "")),
    deadline: marketDeadline(title),
  };
}

/** "… before 2027-01-01 05:00 UTC" -> the ISO instant; null when the title names no exact time. */
export function marketDeadline(title: string): string | null {
  const d = title.match(/\b(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2})?\s*UTC\b/i);
  return d ? new Date(`${d[1]}T${d[2]}:00Z`).toISOString() : null;
}

/**
 * A post that names no deadline, matched to a Cournot market that has one, takes the market's deadline:
 * the probability on the receipt is "before <that date>", and scoring the call against a shorter, invented
 * horizon would measure it against an event Cournot was not asked about. The horizon stays flagged as not
 * the author's own.
 */
export function alignToMarket(claim: Claim): Claim {
  if (!claim.horizonDefaulted) return claim;
  const recorded = recordedFor(claim);
  const deadline = recorded ? parseMarket(recorded.evaluatedClaim)?.deadline ?? null : null;
  return deadline && new Date(deadline).getTime() > Date.now() ? { ...claim, deadline } : claim;
}

/**
 * Does a recorded Cournot response price THIS claim? A recorded response is one real call about one market.
 * Pinning it to every pasted post would show a real probability for a claim nobody asked Cournot about, so it
 * applies only when coin, side and strike match.
 */
export function recordedMatches(claim: Claim, cournot: CournotResponse): boolean {
  const m = parseMarket(cournot.evaluatedClaim);
  return m !== null && m.asset === claim.asset && m.side === claim.direction && Math.abs(m.strike - Number(claim.targetUsd)) < 1e-9;
}

/** Every recorded real Cournot response: evidence/cournot/recorded/*.json, plus the first capture. */
export const RECORDED_DIR = "evidence/cournot/recorded";

export function readAllRecorded(): ProvenCournotResponse[] {
  const out: ProvenCournotResponse[] = [];
  const paths = [RECORDED_PATH];
  try {
    for (const f of readdirSync(/* turbopackIgnore: true */ RECORDED_DIR)) {
      if (f.endsWith(".json") && !f.endsWith("-raw.json")) paths.push(`${RECORDED_DIR}/${f}`);
    }
  } catch {
    /* no directory yet */
  }
  for (const p of paths) {
    try {
      out.push(readRecorded(p));
    } catch {
      /* missing or malformed: skip */
    }
  }
  return out;
}

/** The recorded real Cournot response that priced this claim, if any. */
export function recordedFor(claim: Claim): ProvenCournotResponse | null {
  return readAllRecorded().find((r) => recordedMatches(claim, r)) ?? null;
}
