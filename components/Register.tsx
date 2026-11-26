import type { KolSummary } from "../server/records.ts";
import { Stamp } from "./Stamp.tsx";

function pct(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

/** Signed, zero-padded so a column of Edges compares at a glance. */
function edge(value: number | null): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "±";
  return `${sign}${Math.abs(value).toFixed(3)}`;
}

/**
 * The baseline stamp. This is the column that stops a high hit rate from reading as a track record:
 * a KOL scored only on the labelled proxy says so, and a KOL with no baseline at all says that too.
 */
function Baseline({ s }: { s: KolSummary }) {
  if (s.cournotCalls > 0) {
    return <Stamp state="verified">Cournot × {s.cournotCalls}</Stamp>;
  }
  if (s.proxyCalls > 0) {
    return <Stamp state="referenced">Proxy only × {s.proxyCalls}</Stamp>;
  }
  return <Stamp state="refused">No baseline</Stamp>;
}

/**
 * The leaderboard. Columns separate what was measured (Edge, hit rate, return) from what it was measured
 * against (the baseline column), because the whole product is the difference between those two things.
 */
export function Register({ summaries, sample }: { summaries: readonly KolSummary[]; sample: boolean }) {
  if (summaries.length === 0) {
    return (
      <div className="empty">
        <h2>No calls scored yet</h2>
        <p className="hint">Score a call and this register fills in. Nothing is seeded to look busy.</p>
      </div>
    );
  }

  return (
    <div className="table-scroll">
      <table className="register">
        <caption>
          Ranked by Cournot Edge. A KOL with only proxy-scored calls sorts below every KOL with a real
          baseline, however good their hit rate looks.
          {sample ? " Rows marked SAMPLE are backtested, not live-resolved." : ""}
        </caption>
        <thead>
          <tr>
            <th scope="col" style={{ width: 34 }}>#</th>
            <th scope="col">KOL</th>
            <th scope="col" className="num">Edge</th>
            <th scope="col" className="num">Hit rate</th>
            <th scope="col" className="num">Return</th>
            <th scope="col" className="num">Unresolved</th>
            <th scope="col">Baseline</th>
          </tr>
        </thead>
        <tbody>
          {summaries.map((s, i) => (
            <tr key={s.kolId}>
              <td className="rank">{i + 1}</td>
              <td>
                <a className="kol" href={`/kol/${encodeURIComponent(s.kolId)}`}>{s.kolId}</a>
              </td>
              <td className="num">{s.cournotEdge === null ? <span className="absent">no baseline</span> : edge(s.cournotEdge)}</td>
              <td className="num">{pct(s.hitRate)}</td>
              <td className="num">{pct(s.meanReturn)}</td>
              <td className="num">{s.unresolved === 0 ? "0" : s.unresolved}</td>
              <td><Baseline s={s} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
