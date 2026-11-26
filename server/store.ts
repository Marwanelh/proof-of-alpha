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

import { readFileSync } from "node:fs";

import type { CallRecord } from "../shared/types.ts";

export type LoadedStore = { records: CallRecord[]; source: string; sample: boolean };

export function loadStore(): LoadedStore {
  for (const path of ["data/local.json", "data/seed.json"]) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(/* turbopackIgnore: true */ path, "utf8"));
      const records = Array.isArray(parsed)
        ? (parsed as CallRecord[])
        : ((parsed as { records?: CallRecord[] }).records ?? []);
      if (records.length > 0) {
        return { records, source: path, sample: records.some((r) => r.kind === "backtested") };
      }
    } catch {
      continue; // a corrupt store is not a reason to invent a leaderboard
    }
  }
  return { records: [], source: "none", sample: true };
}

export function loadRecords(): CallRecord[] {
  return loadStore().records;
}
