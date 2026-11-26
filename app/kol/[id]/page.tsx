import { BacktestedReceipt } from "../../../components/Receipt.tsx";
import { MemoryPanel } from "../../../components/MemoryPanel.tsx";
import { Stamp } from "../../../components/Stamp.tsx";
import { rank, summarise, type KolSummary } from "../../../server/records.ts";
import { loadRecords } from "../../../server/store.ts";
import type { BacktestedCallRecord, CallRecord } from "../../../shared/types.ts";

export const dynamic = "force-dynamic";

function priceAtResolution(record: CallRecord): number | null {
  if (record.resolution === null) return null;
  const price = Number(record.resolution.result.cmcPriceUsd);
  return Number.isFinite(price) ? price : null;
}

function pct(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

export default async function KolPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const kolId = decodeURIComponent(id);
  const records = loadRecords();
  const mine = records.filter((r) => r.claim.authorId === kolId);

  if (mine.length === 0) {
    return (
      <main>
        <section className="thesis">
          <p className="label">KOL</p>
          <h1>No calls recorded for {kolId}.</h1>
          <p className="lede">
            We print an empty page rather than a plausible-looking one. Score a call and this record starts.
          </p>
        </section>
      </main>
    );
  }

  const summary: KolSummary = summarise(kolId, records, priceAtResolution);
  // rank() is applied to a single row only to keep the ordering rule in one place; the value here is the
  // summary, not the position.
  const [ranked] = rank([summary]);

  const hedged = ranked?.cournotEdge === null;

  return (
    <main>
      <section className="thesis">
        <p className="label">KOL record</p>
        <h1 className="kol" style={{ fontSize: "clamp(22px,2.6vw,30px)" }}>{kolId}</h1>

        <div className="notes" style={{ borderTop: 0, paddingTop: 0, marginTop: 4 }}>
          <div>
            <p className="label">Cournot edge</p>
            <p className="value" style={{ fontSize: 22 }}>
              {ranked?.cournotEdge === null || ranked === undefined
                ? "no baseline"
                : ranked.cournotEdge.toFixed(3)}
            </p>
          </div>
          <div>
            <p className="label">Hit rate</p>
            <p className="value" style={{ fontSize: 22 }}>{pct(ranked?.hitRate ?? null)}</p>
          </div>
          <div>
            <p className="label">Calls</p>
            <p className="value" style={{ fontSize: 22 }}>
              {summary.cournotCalls + summary.proxyCalls}
              <span className="absent"> resolved · {summary.unresolved} unresolved</span>
            </p>
          </div>
          <div>
            <p className="label">Baseline</p>
            <p>
              {summary.cournotCalls > 0 ? (
                <Stamp state="verified">Cournot × {summary.cournotCalls}</Stamp>
              ) : summary.proxyCalls > 0 ? (
                <Stamp state="referenced">Proxy only × {summary.proxyCalls}</Stamp>
              ) : (
                <Stamp state="refused">No baseline</Stamp>
              )}
            </p>
          </div>
        </div>

        {hedged ? (
          <p className="lede" style={{ marginTop: 18 }}>
            <strong>Read this before the numbers.</strong> None of this KOL&rsquo;s calls carry a real Cournot
            probability, so there is no Edge figure to show. The hit rate above is measured against a labelled
            proxy baseline and is not a track record.
          </p>
        ) : null}
      </section>

      <MemoryPanel kolId={kolId} calls={mine.length} />

      <div style={{ display: "grid", gap: 22, marginTop: 28 }}>
        {mine.map((r) =>
          r.kind === "backtested" ? (
            <BacktestedReceipt key={r.id} record={r as BacktestedCallRecord} />
          ) : (
            <article key={r.id} className="receipt">
              <div className="receipt-head">
                <div>
                  <p className="label">Locked call</p>
                  <h2 className="kol">{r.claim.asset} · {r.claim.direction}</h2>
                </div>
                <span className="receipt-index">{r.id}</span>
              </div>
              <div className="receipt-body">
                <p className="hint" style={{ padding: "14px 20px", margin: 0 }}>
                  A verified record. Open the transaction on the block explorer to check it.
                </p>
              </div>
            </article>
          ),
        )}
      </div>
    </main>
  );
}
