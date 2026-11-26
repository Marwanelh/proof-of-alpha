import Link from "next/link";

import { CallHistory } from "../../../components/CallHistory.tsx";
import { MemoryPanel } from "../../../components/MemoryPanel.tsx";
import { MIN_RESOLVED_FOR_HIT_RATE, signedEdge } from "../../../components/Register.tsx";
import { callView, kolMemory } from "../../../server/insights.ts";
import { summarise } from "../../../server/records.ts";
import { loadRecords } from "../../../server/store.ts";
import { initials } from "../../../shared/explorer.ts";
import type { CallRecord } from "../../../shared/types.ts";

export const dynamic = "force-dynamic";

function priceAtResolution(record: CallRecord): number | null {
  if (record.resolution === null) return null;
  const price = Number(record.resolution.result.cmcPriceUsd);
  return Number.isFinite(price) ? price : null;
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export default async function KolPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const kolId = decodeURIComponent(id);
  const records = loadRecords();
  const mine = records.filter((r) => r.claim.authorId === kolId);

  if (mine.length === 0) {
    return (
      <main>
        <Link href="/leaderboard" className="back">← Leaderboard</Link>
        <section className="page-head">
          <h1>No calls recorded for {kolId}.</h1>
          <p>We print an empty page rather than a plausible-looking one. Verify a call and this record starts.</p>
        </section>
      </main>
    );
  }

  const s = summarise(kolId, records, priceAtResolution);
  const resolved = s.cournotCalls + s.proxyCalls;
  const memory = kolMemory(kolId, records);
  const views = mine.map(callView).sort((a, b) => b.postedAt.localeCompare(a.postedAt));
  const first = views[views.length - 1]!;
  const sources = new Set(mine.map((r) => r.claim.source));
  const edge = s.cournotEdge ?? s.proxyEdge;

  return (
    <main>
      <Link href="/leaderboard" className="back">← Leaderboard</Link>

      <section className="card profile-head">
        <div className="profile-id">
          <span className="avatar lg" aria-hidden="true">{initials(kolId)}</span>
          <div>
            <h1>{kolId}</h1>
            <p>
              {sources.has("cmc") ? "CMC Community" : "Pasted posts"} · tracked since {day(first.postedAt)}
              {mine.some((r) => r.kind === "backtested") ? " · includes backtested samples" : ""}
            </p>
          </div>
        </div>
        <div className="profile-stats">
          <div>
            <div className="stat-label">Calls</div>
            <div className="stat-value">{mine.length}</div>
          </div>
          <div>
            <div className="stat-label">Hit rate</div>
            <div className="stat-value">
              {s.hitRate !== null && resolved >= MIN_RESOLVED_FOR_HIT_RATE ? `${Math.round(s.hitRate * 100)}%` : "—"}
            </div>
            {resolved < MIN_RESOLVED_FOR_HIT_RATE ? <div className="stat-note hint">needs {MIN_RESOLVED_FOR_HIT_RATE} resolved</div> : null}
          </div>
          <div>
            <div className="stat-label">{s.cournotEdge !== null ? "Edge" : "Proxy edge"}</div>
            <div className={`stat-value ${edge === null ? "" : edge >= 0 ? "tone-pos" : "tone-neg"}`}>
              {edge === null ? "—" : signedEdge(edge)}
            </div>
          </div>
          <div>
            <div className="stat-label">Open</div>
            <div className="stat-value">{s.unresolved}</div>
          </div>
        </div>
      </section>

      <div className="two-col">
        <CallHistory calls={views} />

        <aside className="side">
          <div className="card card-pad">
            <p className="card-title" data-tone="lime">Living Brain · what we remember</p>
            <dl className="kv" style={{ margin: 0 }}>
              <div>
                <dt>Strongest on</dt>
                <dd>
                  {memory.strongest
                    ? `${memory.strongest.asset} — ${memory.strongest.hits} of ${memory.strongest.resolved} right`
                    : "Nothing resolved yet"}
                </dd>
              </div>
              {memory.weakest ? (
                <div>
                  <dt>Weakest on</dt>
                  <dd>{memory.weakest.asset} — {memory.weakest.hits} of {memory.weakest.resolved} right</dd>
                </div>
              ) : null}
              <div>
                <dt>Stance change</dt>
                <dd>
                  {memory.stanceChanges.length > 0
                    ? memory.stanceChanges
                        .slice(-2)
                        .map((c) => `Turned ${c.to} on ${c.asset} on ${day(c.at)}`)
                        .join("; ")
                    : "None — every call on an asset points the same way"}
                </dd>
              </div>
              <div>
                <dt>Connected to</dt>
                <dd>
                  {memory.connected.length > 0
                    ? memory.connected
                        .slice(0, 2)
                        .map((c) => `${c.a === kolId ? c.b : c.a} — same token within 24h, ${c.times}×`)
                        .join("; ")
                    : "No co-posting found"}
                </dd>
              </div>
            </dl>
          </div>

          <MemoryPanel kolId={kolId} calls={mine.length} />
        </aside>
      </div>
    </main>
  );
}
