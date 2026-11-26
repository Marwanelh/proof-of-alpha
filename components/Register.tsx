import Link from "next/link";

import type { KolSummary } from "../server/records.ts";
import { initials } from "../shared/explorer.ts";

/** Hit rate is noise on a handful of calls, so it is withheld until a KOL has this many resolved. */
export const MIN_RESOLVED_FOR_HIT_RATE = 3;

function signedPct(v: number | null): string {
  if (v === null) return "—";
  const s = v > 0 ? "+" : v < 0 ? "−" : "±";
  return `${s}${Math.abs(v * 100).toFixed(1)}%`;
}

export function signedEdge(v: number): string {
  const s = v > 0 ? "+" : v < 0 ? "−" : "±";
  return `${s}${Math.abs(v).toFixed(2)}`;
}

function EdgeCell({ s }: { s: KolSummary }) {
  if (s.cournotEdge !== null) {
    return <span className={`pill ${s.cournotEdge >= 0 ? "pos" : "neg"}`}>{signedEdge(s.cournotEdge)}</span>;
  }
  if (s.proxyEdge !== null) {
    return (
      <>
        <span className={`pill ${s.proxyEdge >= 0 ? "pos" : "neg"}`} style={{ opacity: 0.8 }}>
          {signedEdge(s.proxyEdge)}
        </span>
        <span className="pill-note">proxy · not Cournot</span>
      </>
    );
  }
  return <span className="pill none">no baseline</span>;
}

function Baseline({ s }: { s: KolSummary }) {
  if (s.cournotCalls > 0) return <span className="tone-lime">Cournot × {s.cournotCalls}</span>;
  if (s.proxyCalls > 0) return <span className="flag">Proxy only × {s.proxyCalls}</span>;
  return <span className="absent">—</span>;
}

/** The leaderboard table. Edge is measured against the market; the baseline column says which market. */
export function Register({ summaries }: { summaries: readonly KolSummary[] }) {
  if (summaries.length === 0) {
    return (
      <div className="empty">
        <h2>No calls scored yet</h2>
        <p className="hint">Verify a call and this board fills in. Nothing is seeded to look busy.</p>
      </div>
    );
  }

  return (
    <div className="table-scroll">
      <table className="board">
        <thead>
          <tr>
            <th scope="col" style={{ width: 40 }}>#</th>
            <th scope="col">KOL</th>
            <th scope="col">Calls</th>
            <th scope="col">Hit rate</th>
            <th scope="col">Avg return</th>
            <th scope="col">Edge</th>
            <th scope="col">Baseline</th>
          </tr>
        </thead>
        <tbody>
          {summaries.map((s, i) => {
            const resolved = s.cournotCalls + s.proxyCalls;
            const showHit = s.hitRate !== null && resolved >= MIN_RESOLVED_FOR_HIT_RATE;
            return (
              <tr key={s.kolId}>
                <td className="num" style={{ color: "var(--text-2)" }}>{i + 1}</td>
                <td>
                  <Link className="who" href={`/kol/${encodeURIComponent(s.kolId)}`}>
                    <span className="avatar" aria-hidden="true">{initials(s.kolId)}</span>
                    {s.kolId}
                  </Link>
                </td>
                <td className="num">{resolved + s.unresolved}</td>
                <td>
                  {showHit ? (
                    <span className="bar">
                      <span className="bar-track">
                        <span className="bar-fill" style={{ width: `${Math.round((s.hitRate ?? 0) * 100)}%` }} />
                      </span>
                      <span className="num">{Math.round((s.hitRate ?? 0) * 100)}%</span>
                    </span>
                  ) : (
                    <span className="absent" title={`Hit rate is shown from ${MIN_RESOLVED_FOR_HIT_RATE} resolved calls`}>
                      {resolved} of {MIN_RESOLVED_FOR_HIT_RATE} resolved
                    </span>
                  )}
                </td>
                <td className={`num ${s.meanReturn === null ? "" : s.meanReturn >= 0 ? "tone-pos" : "tone-neg"}`}>
                  {signedPct(s.meanReturn)}
                </td>
                <td>
                  <EdgeCell s={s} />
                </td>
                <td>
                  <Baseline s={s} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
