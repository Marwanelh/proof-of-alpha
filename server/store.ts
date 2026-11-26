/**
 * The local record store — one reader, used by the leaderboard, the KOL page and the memory route.
 *
 * Deployment note (Vercel): `data/local.json` is gitignored, so it will not exist in a deployment. The
 * committed `data/seed.json` must therefore travel with the server bundle, which is not automatic for a
 * runtime `readFileSync` with a computed path — Next only traces reads it can see statically. `next.config.mjs`
 * forces `data/**` into the trace with `outputFileTracingIncludes`, and the build verifies it by grepping the
 * emitted trace manifests for the file. Without that, the deployed leaderboard renders empty while working
 * perfectly on localhost, which is the worst possible way to discover it: on stage.
 *
 * The sample flag is derived from what the ROWS ARE, never from which file they came from. `npm run seed`
 * copies the committed backtested rows into local.json, so a filename-based flag reports a board of samples
 * as live data.
 */

import { readFileSync, writeFileSync } from "node:fs";

import type { CallRecord } from "../shared/types.ts";

/**
 * `sample`: fictional seed rows are on the board. `backtested`: real posts scored after the fact against a
 * proxy baseline. The leaderboard labels each, because they mean very different things.
 */
export type LoadedStore = { records: CallRecord[]; source: string; sample: boolean; backtested: boolean };

/** Confirmed on-chain receipts. Committed, so a deployment shows them; appended by /api/verify. */
export const LIVE_PATH = "data/live.json";
/** Real CMC Community posts, backtested by scripts/backfill.mjs. When present it replaces the fictional seed. */
export const BACKTEST_PATH = "data/backtest.json";

function readRecords(path: string): CallRecord[] | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(/* turbopackIgnore: true */ path, "utf8"));
    return Array.isArray(parsed) ? (parsed as CallRecord[]) : ((parsed as { records?: CallRecord[] }).records ?? []);
  } catch {
    return null; // missing or corrupt: not a reason to invent a leaderboard
  }
}

/**
 * Real backtested posts (else local.json, else the committed seed) plus every confirmed receipt in live.json,
 * each id once. Receipts live in their own committed file because local.json is gitignored and a deployment
 * never has it, and because the seed guard refuses a receipt in seed.json.
 */
export function loadStore(): LoadedStore {
  let base: CallRecord[] = [];
  let source = "none";
  for (const path of [BACKTEST_PATH, "data/local.json", "data/seed.json"]) {
    const rows = readRecords(path);
    if (rows !== null && rows.length > 0) {
      base = path === BACKTEST_PATH ? rows : rows.filter((r) => !(path !== "data/seed.json" && r.kind === "verified"));
      source = path;
      break;
    }
  }
  const live = readRecords(LIVE_PATH) ?? [];
  const seen = new Set(base.map((r) => r.id));
  const records = [...base, ...live.filter((r) => !seen.has(r.id))];
  if (live.length > 0) source = `${source} + ${LIVE_PATH}`;
  return {
    records,
    source,
    sample: records.some((r) => r.id.startsWith("sample-")),
    backtested: records.some((r) => r.kind === "backtested" && !r.id.startsWith("sample-")),
  };
}

export function loadRecords(): CallRecord[] {
  return loadStore().records;
}

/** Append one confirmed on-chain call to data/live.json. Throws on a read-only filesystem. */
export function appendRecord(record: CallRecord): void {
  const records = readRecords(LIVE_PATH) ?? [];
  if (records.some((r) => r.id === record.id)) return;
  records.push(record);
  writeFileSync(
    /* turbopackIgnore: true */ LIVE_PATH,
    JSON.stringify({ updatedAt: new Date().toISOString(), count: records.length, records }, null, 2) + "\n",
  );
}
