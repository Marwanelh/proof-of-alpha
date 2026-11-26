import { existsSync, readFileSync } from "node:fs";

import { Register } from "../../components/Register.tsx";
import { rank, summarise, type KolSummary } from "../../server/records.ts";
import type { CallRecord } from "../../shared/types.ts";

export const dynamic = "force-dynamic";

type Loaded = { records: CallRecord[]; source: string; sample: boolean };

/**
 * Read the local store, falling back to the committed sample.
 *
 * `sample` is derived from what the ROWS ARE, not from which file they came from. Deriving it from the path
 * was wrong and it showed: `data/local.json` is written by `npm run seed`, which copies the committed
 * backtested rows, so a leaderboard full of samples rendered with no warning at all. The data already says
 * what it is (`kind: "backtested"`); read that instead of trusting the filename.
 */
function load(): Loaded {
  const candidates = ["data/local.json", "data/seed.json"];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
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

/**
 * Return per call, from the price already recorded on the resolution. No network call: a leaderboard that
 * needs three providers to render is a leaderboard that is blank when the wifi dies.
 */
function priceAtResolution(record: CallRecord): number | null {
  if (record.resolution === null) return null;
  const price = Number(record.resolution.result.cmcPriceUsd);
  return Number.isFinite(price) ? price : null;
}

export default function LeaderboardPage() {
  const { records, source, sample } = load();

  const kolIds = [...new Set(records.map((r) => r.claim.authorId))].sort();
  const summaries: KolSummary[] = rank(kolIds.map((id) => summarise(id, records, priceAtResolution)));

  return (
    <main>
      <section className="thesis">
        <p className="label">The register</p>
        <h1>Who is actually right, not just loud.</h1>
        <p className="lede">
          Ranked by Edge. A correct call the market already expected earns almost nothing; a confident miss
          costs. Hit rate alone is not a track record, which is why the baseline column sits beside it.
        </p>
      </section>

      <Register summaries={summaries} sample={sample} />

      <section className="notes">
        <div>
          <h2>Why proxy-scored KOLs sort last</h2>
          <p>
            A call with no Cournot probability gets a labelled proxy baseline instead. It is reported
            separately and never averaged into a Cournot Edge, because the resulting number would look
            authoritative while meaning nothing.
          </p>
        </div>
        <div>
          <h2>&ldquo;No baseline&rdquo; is a result</h2>
          <p>
            If nothing on the register carries a real probability, we say so here rather than presenting the
            table as a track record.
          </p>
        </div>
        <div>
          <h2>Source</h2>
          <p className="mono" style={{ fontSize: 12.5 }}>
            {source} · {records.length} call{records.length === 1 ? "" : "s"}
            {sample ? " · backtested sample, not live-resolved" : ""}
          </p>
        </div>
      </section>
    </main>
  );
}
