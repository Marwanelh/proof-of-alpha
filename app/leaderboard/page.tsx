import Link from "next/link";

import { Register } from "../../components/Register.tsx";
import { boardTotals, coPostings } from "../../server/insights.ts";
import { rank, summarise, type KolSummary } from "../../server/records.ts";
import { loadStore } from "../../server/store.ts";
import type { CallRecord } from "../../shared/types.ts";

export const dynamic = "force-dynamic";

/** Return per call, from the price already on the resolution. No network: the board must render offline. */
function priceAtResolution(record: CallRecord): number | null {
  if (record.resolution === null) return null;
  const price = Number(record.resolution.result.cmcPriceUsd);
  return Number.isFinite(price) ? price : null;
}

const fmt = (n: number) => n.toLocaleString("en-US");

export default function LeaderboardPage() {
  const { records, sample } = loadStore();
  const kolIds = [...new Set(records.map((r) => r.claim.authorId))].sort();
  const summaries: KolSummary[] = rank(kolIds.map((id) => summarise(id, records, priceAtResolution)));
  const totals = boardTotals(records);
  const link = coPostings(records)[0];

  return (
    <main>
      <section className="page-head">
        {sample ? <span className="chip">Sample data · backtested, not live-resolved</span> : <span className="chip" data-tone="live">Live record</span>}
        <h1>Who&rsquo;s actually right?</h1>
        <p>
          Every call is broken into a claim, scored against real prices and against what the market already
          expected, then recorded on BNB Chain so it can&rsquo;t be deleted.
        </p>
      </section>

      <section className="stats" aria-label="Totals">
        <div className="card stat">
          <div className="stat-label">Calls scored</div>
          <div className="stat-value">{fmt(totals.calls)}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">KOLs tracked</div>
          <div className="stat-value">{fmt(totals.kols)}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">On-chain receipts</div>
          <div className="stat-value tone-lime">{fmt(totals.onChain)}</div>
          <div className="stat-note">CallRegistry · BSC testnet</div>
        </div>
        <div className="card stat">
          <div className="stat-label">Priced by Cournot</div>
          <div className="stat-value">{fmt(totals.cournotPriced)}</div>
          <div className="stat-note">the rest use a labelled proxy</div>
        </div>
      </section>

      <div className="two-col">
        <section className="card" aria-label="Leaderboard">
          <div className="board-head">
            <h2>Leaderboard · sorted by Edge</h2>
            <span className="hint">Source: CMC Community · prices: CMC + Atlas</span>
          </div>
          <Register summaries={summaries} />
        </section>

        <aside className="side">
          <div className="card card-pad">
            <p className="card-title" data-tone="lime">◷ Living Brain · Connections</p>
            {link ? (
              <div className="insight">
                <p>
                  {link.a} and {link.b} called the same token ({link.assets.join(", ")}) within 24 hours of each
                  other {link.times === 1 ? "once" : `${link.times} times`}.
                </p>
                <p className="insight-meta">A timing fact, not an accusation · from {totals.calls} recorded calls</p>
              </div>
            ) : (
              <div className="insight">
                <p>No two KOLs have called the same token within 24 hours of each other yet.</p>
                <p className="insight-meta">Checked across {totals.calls} recorded calls</p>
              </div>
            )}
          </div>

          <div className="card card-pad">
            <p className="card-title">How Edge works</p>
            <p className="insight" style={{ margin: 0 }}>
              A right call the market already expected earns little. Edge rewards calls that beat the Cournot
              probability at the moment of posting.
            </p>
            <div className="edge-legend">
              <div>
                <span>Consensus hit (p=0.9)</span>
                <span className="tone-pos">+0.1</span>
              </div>
              <div>
                <span>Contrarian hit (p=0.2)</span>
                <span className="tone-pos">+0.8</span>
              </div>
              <div>
                <span>Confident miss (p=0.7)</span>
                <span className="tone-neg">−0.7</span>
              </div>
            </div>
          </div>

          <Link href="/" className="btn block">
            Submit a call to verify
          </Link>
        </aside>
      </div>
    </main>
  );
}
