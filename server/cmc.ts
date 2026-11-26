/**
 * CoinMarketCap gateway — two bases on one host, and they behave differently.
 *
 * Verified facts this file encodes (docs/integration-findings.md §1/§1b):
 *  - the keyless base is /public-api and needs no account; it shares an IP rate pool, so a 429 is
 *    normal and must be retried with backoff rather than treated as a failure
 *  - the keyless envelope puts quotes in an ARRAY: data[0].quotes[0].price. The classic Pro envelope
 *    (data[0].quote.USD.price) does NOT apply, and reading it yields silent undefined
 *  - /v1/content/posts/latest NEEDS a key, requires EXACTLY ONE of id/slug/symbol, has NO `limit`
 *    parameter, and pages backwards with `last_score`
 *
 * The key is read from the environment here and is never returned, logged, or echoed in an error.
 *
 * NOTE: add `import "server-only"` here once the Next app lands.
 */

import type { CmcSnapshot } from "../shared/types.ts";

const KEYLESS_BASE = "https://pro-api.coinmarketcap.com/public-api";
const KEYED_BASE = "https://pro-api.coinmarketcap.com";

export class CmcError extends Error {}

export type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<{
  status: number;
  text: () => Promise<string>;
  headers?: { get(name: string): string | null };
}>;

type Json = Record<string, unknown>;

/** Keyless spot price. No account, no key, no signup. */
export async function keylessPrice(
  symbol: string,
  opts: { fetchImpl?: FetchLike; tries?: number; convert?: string } = {},
): Promise<CmcSnapshot> {
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  const convert = opts.convert ?? "USD";
  const url = `${KEYLESS_BASE}/v2/simple/price?symbol=${encodeURIComponent(symbol)}&convert=${encodeURIComponent(convert)}`;

  const body = await getJsonWithBackoff<Json>(url, {}, fetchImpl, opts.tries ?? 5);
  const data = body["data"];
  if (!Array.isArray(data) || data.length === 0) throw new CmcError(`no data for ${symbol}`);

  const entry = data[0] as Json;
  const quotes = entry["quotes"];
  if (!Array.isArray(quotes) || quotes.length === 0) {
    throw new CmcError(
      `unexpected keyless envelope for ${symbol}: expected data[0].quotes[0].price. Got keys: ${Object.keys(entry).join(", ")}`,
    );
  }
  const quote = quotes[0] as Json;
  const price = quote["price"];
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
    throw new CmcError(`implausible price for ${symbol}: ${String(price)}`);
  }

  return { priceUsd: String(price), observedAt: new Date().toISOString() };
}

export type CmcPost = {
  id?: string;
  authorId: string;
  text: string;
  postedAt: string;
};

/**
 * Keyed, per-symbol Community posts — our source of calls.
 * Exactly one of id/slug/symbol is required by the API even though the reference marks them optional.
 */
export async function latestPosts(
  selector: { id?: string; slug?: string; symbol?: string },
  opts: { apiKey?: string; lastScore?: string; fetchImpl?: FetchLike } = {},
): Promise<CmcPost[]> {
  const apiKey = opts.apiKey ?? process.env["CMC_API_KEY"];
  if (!apiKey) {
    throw new CmcError(
      "CMC_API_KEY is not set — this endpoint returns 403 error_code 1005 without one. " +
        "Put it in .env.local (never .env.example) and run `npm run smoke`.",
    );
  }

  const given = [selector.id, selector.slug, selector.symbol].filter((v) => v !== undefined && v !== "");
  if (given.length !== 1) {
    throw new CmcError(`exactly one of id/slug/symbol is required, got ${given.length}`);
  }

  const params = new URLSearchParams();
  if (selector.id) params.set("id", selector.id);
  if (selector.slug) params.set("slug", selector.slug);
  if (selector.symbol) params.set("symbol", selector.symbol);
  if (opts.lastScore) params.set("last_score", opts.lastScore);

  const url = `${KEYED_BASE}/v1/content/posts/latest?${params.toString()}`;
  const body = await getJsonWithBackoff<Json>(url, { "X-CMC_PRO_API_KEY": apiKey }, opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike), 3);

  const data = body["data"];
  const rows = Array.isArray(data) ? data : Array.isArray((data as Json | undefined)?.["posts"]) ? ((data as Json)["posts"] as unknown[]) : [];
  return rows.flatMap((row): CmcPost[] => {
    if (typeof row !== "object" || row === null) return [];
    const r = row as Json;
    const text = firstString(r, ["text", "content", "post_text", "body"]);
    if (!text) return [];
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

function firstString(obj: Json, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim() !== "") return v;
  }
  return null;
}

async function getJsonWithBackoff<T>(url: string, headers: Record<string, string>, fetchImpl: FetchLike, tries: number): Promise<T> {
  let lastStatus = 0;
  for (let attempt = 0; attempt < tries; attempt++) {
    const res = await fetchImpl(url, { headers: { Accept: "application/json", ...headers } });
    lastStatus = res.status;
    const text = await res.text();
    if (res.status === 200) {
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new CmcError(`non-JSON response from ${new URL(url).pathname}`);
      }
    }
    if (res.status === 403 || res.status === 401) {
      // Never rethrow the provider body: it can echo request context back at us.
      throw new CmcError(`HTTP ${res.status}: this key has no access to ${new URL(url).pathname} (error_code 1005)`);
    }
    if (res.status !== 429 && res.status < 500) throw new CmcError(`HTTP ${res.status} from ${new URL(url).pathname}`);
    // 429 shares an IP rate pool; back off and retry rather than fail the demo.
    await new Promise((r) => setTimeout(r, 250 * 2 ** attempt));
  }
  throw new CmcError(`rate limited after ${tries} attempts (last HTTP ${lastStatus}) — the keyless pool is per IP`);
}
