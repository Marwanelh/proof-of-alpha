/**
 * CoinMarketCap gateway — two bases on one host, two envelopes, two plans.
 *
 * Verified facts this file encodes (docs/integration-findings.md §1/§1b/§1c):
 *  - the keyless base is /public-api and needs no account; it shares an IP rate pool, so 429 is normal
 *    and must be backed off, not treated as a failure
 *  - the KEYLESS envelope is an ARRAY: data[0].quotes[0].price
 *  - the KEYED envelope is an OBJECT keyed by symbol: data.BNB.quote.USD.price   (verified live, same price)
 *  - /v1/content/posts/latest needs a key AND requires EXACTLY ONE of id/slug/symbol, and has NO `limit`
 *  - error_code 1006 means "your plan doesn't include this endpoint" — a plan limit, NOT a bad key.
 *    The free Basic plan returns it for the Content endpoints (verified 2026-11-26). 1005 means no key
 *    reached the API; 1001 means the key is invalid. Three different fixes behind one HTTP 403.
 *
 * The key is read from the environment and is never returned, logged, or echoed in an error.
 *
 * NOTE: add `import "server-only"` here once the Next app lands.
 */

import type { CmcSnapshot } from "../shared/types.ts";

const KEYLESS_BASE = "https://pro-api.coinmarketcap.com/public-api";
const KEYED_BASE = "https://pro-api.coinmarketcap.com";

/** CMC error codes we actually handle, named, because 1005 and 1006 mean opposite things to a builder. */
export const CMC_ERRORS = {
  /** The key is malformed or revoked. Fix the key. */
  INVALID_KEY: 1001,
  /** No key reached the API at all. Usually the header, not the key. */
  KEY_REQUIRED: 1005,
  /** The key is valid but the plan does not include this endpoint. Ask CMC, do not debug your code. */
  PLAN_EXCLUDES_ENDPOINT: 1006,
} as const;

export class CmcError extends Error {
  readonly errorCode: number | null;
  constructor(message: string, errorCode: number | null = null) {
    super(message);
    this.errorCode = errorCode;
  }
}

export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<{ status: number; text: () => Promise<string>; headers?: { get(name: string): string | null } }>;

type Json = Record<string, unknown>;

/* ------------------------------------------------------------------- keyless */

/** Keyless spot price. No account, no key, no signup. Array envelope. */
export async function keylessPrice(
  symbol: string,
  opts: { fetchImpl?: FetchLike; tries?: number; convert?: string } = {},
): Promise<CmcSnapshot> {
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  const convert = opts.convert ?? "USD";
  const url = `${KEYLESS_BASE}/v2/simple/price?symbol=${encodeURIComponent(symbol)}&convert=${encodeURIComponent(convert)}`;

  const body = await request<Json>(url, {}, fetchImpl, opts.tries ?? 5);
  const data = body["data"];
  if (!Array.isArray(data) || data.length === 0) throw new CmcError(`no data for ${symbol}`);
  const entry = data[0] as Json;
  const quotes = entry["quotes"];
  if (!Array.isArray(quotes) || quotes.length === 0) {
    throw new CmcError(
      `unexpected keyless envelope for ${symbol}: expected data[0].quotes[0].price. Got keys: ${Object.keys(entry).join(", ")}`,
    );
  }
  const price = (quotes[0] as Json)["price"];
  return { priceUsd: assertPrice(price, symbol), observedAt: new Date().toISOString(), source: "keyless" };
}

/* --------------------------------------------------------------------- keyed */

/**
 * Keyed quotes. This IS the live Pro API call the CMC × Atlas entry asks for, so it belongs inside the
 * verify flow rather than off to the side. Object envelope, and one credit covers several symbols.
 */
export async function keyedQuotes(
  symbols: readonly string[],
  opts: { apiKey?: string; fetchImpl?: FetchLike; convert?: string } = {},
): Promise<Record<string, CmcSnapshot>> {
  const apiKey = opts.apiKey ?? process.env["CMC_API_KEY"];
  if (!apiKey) {
    throw new CmcError("CMC_API_KEY is not set — put it in .env.local (never .env.example)", CMC_ERRORS.KEY_REQUIRED);
  }
  if (symbols.length === 0) throw new CmcError("at least one symbol is required");

  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  const convert = opts.convert ?? "USD";
  const url = `${KEYED_BASE}/v1/cryptocurrency/quotes/latest?symbol=${encodeURIComponent(symbols.join(","))}&convert=${encodeURIComponent(convert)}`;

  const body = await request<Json>(url, { "X-CMC_PRO_API_KEY": apiKey }, fetchImpl, 3);
  const data = body["data"];
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new CmcError(
      `unexpected keyed envelope: expected an object keyed by symbol, got ${Array.isArray(data) ? "an array" : typeof data}`,
    );
  }

  const observedAt = new Date().toISOString();
  const out: Record<string, CmcSnapshot> = {};
  for (const symbol of symbols) {
    const entry = (data as Json)[symbol];
    if (typeof entry !== "object" || entry === null) continue;
    const quote = (entry as Json)["quote"];
    if (typeof quote !== "object" || quote === null) continue;
    const usd = (quote as Json)[convert];
    if (typeof usd !== "object" || usd === null) continue;
    out[symbol] = { priceUsd: assertPrice((usd as Json)["price"], symbol), observedAt, source: "keyed" };
  }
  if (Object.keys(out).length === 0) {
    throw new CmcError(
      `keyed envelope had no ${convert} price for ${symbols.join(", ")} — expected data.<SYMBOL>.quote.${convert}.price`,
    );
  }
  return out;
}

/**
 * The price that goes into a receipt. Prefers the keyed call so a live Pro API call sits inside the core
 * feature; falls back to keyless so the demo cannot fail because a key is missing. The `source` field
 * records which one it was, so the write-up can show it rather than assert it.
 */
export async function snapshotPrice(
  symbol: string,
  opts: { apiKey?: string; fetchImpl?: FetchLike } = {},
): Promise<CmcSnapshot> {
  const apiKey = opts.apiKey ?? process.env["CMC_API_KEY"];
  if (apiKey) {
    const keyed = await keyedQuotes([symbol], { ...opts, apiKey });
    const snap = keyed[symbol];
    if (snap) return snap;
  }
  return keylessPrice(symbol, opts);
}

/* ---------------------------------------------------------- content (gated) */

export type CmcPost = { id?: string; authorId: string; text: string; postedAt: string };

/**
 * Keyed, per-symbol Community posts — the ideal call source, gated behind a paid plan.
 * Exactly one of id/slug/symbol is required by the API even though the reference marks them optional.
 * On 1006 the message says what to do, because 1006 is not a code defect.
 */
export async function latestPosts(
  selector: { id?: string; slug?: string; symbol?: string },
  opts: { apiKey?: string; lastScore?: string; fetchImpl?: FetchLike } = {},
): Promise<CmcPost[]> {
  const apiKey = opts.apiKey ?? process.env["CMC_API_KEY"];
  if (!apiKey) {
    throw new CmcError(
      "CMC_API_KEY is not set — this endpoint returns 403 error_code 1005 without one",
      CMC_ERRORS.KEY_REQUIRED,
    );
  }

  const given = [selector.id, selector.slug, selector.symbol].filter((v) => v !== undefined && v !== "");
  if (given.length !== 1) throw new CmcError(`exactly one of id/slug/symbol is required, got ${given.length}`);

  const params = new URLSearchParams();
  if (selector.id) params.set("id", selector.id);
  if (selector.slug) params.set("slug", selector.slug);
  if (selector.symbol) params.set("symbol", selector.symbol);
  if (opts.lastScore) params.set("last_score", opts.lastScore);

  const url = `${KEYED_BASE}/v1/content/posts/latest?${params.toString()}`;
  const body = await request<Json>(
    url,
    { "X-CMC_PRO_API_KEY": apiKey },
    opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike),
    3,
  );

  const data = body["data"];
  const rows = Array.isArray(data)
    ? data
    : Array.isArray((data as Json | undefined)?.["posts"])
      ? ((data as Json)["posts"] as unknown[])
      : [];

  return rows.flatMap((row): CmcPost[] => {
    if (typeof row !== "object" || row === null) return [];
    const r = row as Json;
    const text = firstString(r, ["text", "content", "post_text", "body"]);
    if (text === null) return [];
    const post: CmcPost = {
      authorId: firstString(r, ["author_nickname", "nickname", "username", "author"]) ?? "unknown",
      text,
      postedAt: firstString(r, ["post_time", "created_at", "posted_at", "time"]) ?? new Date().toISOString(),
    };
    const id = firstString(r, ["id", "post_id"]);
    if (id !== null) post.id = id;
    return [post];
  });
}

/* ----------------------------------------------------------------- internals */

function assertPrice(v: unknown, symbol: string): string {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) {
    throw new CmcError(`implausible price for ${symbol}: ${String(v)}`);
  }
  return String(v);
}

function firstString(obj: Json, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim() !== "") return v;
  }
  return null;
}

async function request<T>(url: string, headers: Record<string, string>, fetchImpl: FetchLike, tries: number): Promise<T> {
  const path = new URL(url).pathname;
  let lastStatus = 0;

  for (let attempt = 0; attempt < tries; attempt++) {
    const res = await fetchImpl(url, { headers: { Accept: "application/json", ...headers } });
    lastStatus = res.status;
    const text = await res.text();

    let parsed: Json | null = null;
    try {
      parsed = JSON.parse(text) as Json;
    } catch {
      parsed = null;
    }
    const status = parsed?.["status"] as Json | undefined;
    // The keyless base returns error_code as the STRING "0"; the keyed base returns the NUMBER 0.
    // Verified live 2026-11-26. Comparing strictly against 0 made a successful call throw "HTTP 200".
    const rawCode = status?.["error_code"];
    const code =
      typeof rawCode === "number"
        ? rawCode
        : typeof rawCode === "string" && rawCode.trim() !== ""
          ? Number(rawCode)
          : null;
    const message = typeof status?.["error_message"] === "string" ? (status["error_message"] as string) : null;

    if (res.status === 200) {
      if (parsed === null) throw new CmcError(`${path}: HTTP 200 but the body was not JSON`);
      // A missing status block is not an error; an explicit non-zero code is. Only 0 and absent pass.
      if (code === null || code === 0) return parsed as unknown as T;
    }

    if (code !== null && code !== 0) {
      // Named outcomes. Never rethrow the provider body verbatim: it can echo request context.
      if (code === CMC_ERRORS.PLAN_EXCLUDES_ENDPOINT) {
        throw new CmcError(
          `${path}: this endpoint is not in the key's subscription plan (error_code 1006). The key is valid — ` +
            "the free Basic plan excludes the Content endpoints. Ask the CMC team for access and use the " +
            "paste-verify path in the meantime.",
          code,
        );
      }
      if (code === CMC_ERRORS.INVALID_KEY) throw new CmcError(`${path}: the API key is invalid or revoked (error_code 1001)`, code);
      if (code === CMC_ERRORS.KEY_REQUIRED) throw new CmcError(`${path}: no API key reached the API (error_code 1005)`, code);
      throw new CmcError(`${path}: CMC error_code ${code}${message ? ` — ${message}` : ""}`, code);
    }

    if (res.status === 403 || res.status === 401) {
      throw new CmcError(`${path}: HTTP ${res.status} with no CMC error code`, null);
    }
    if (res.status !== 429 && res.status < 500) throw new CmcError(`${path}: HTTP ${res.status}`, null);

    // 429: the keyless pool is per IP, so back off rather than fail the demo.
    await new Promise((r) => setTimeout(r, 250 * 2 ** attempt));
  }
  throw new CmcError(`${new URL(url).pathname}: rate limited after ${tries} attempts (last HTTP ${lastStatus})`);
}
