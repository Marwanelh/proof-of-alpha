"use client";

import { useState } from "react";

import type { CallView } from "../shared/views.ts";
import { shortHex, txUrl } from "../shared/explorer.ts";

type Filter = "all" | "hit" | "miss";

function stamp(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  return `${date} · ${time} UTC`;
}

function signed(v: number, digits: number, pct = false): string {
  const s = v > 0 ? "+" : v < 0 ? "−" : "±";
  return `${s}${Math.abs(pct ? v * 100 : v).toFixed(digits)}${pct ? "%" : ""}`;
}

const PROB_LABEL: Record<CallView["probabilityKind"], string> = {
  cournot: "Cournot at post",
  proxy: "Proxy p · not Cournot",
  fixture: "Fixture p · not live",
};

export function CallHistory({ calls }: { calls: CallView[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const shown = calls.filter((c) => filter === "all" || c.outcome === filter);

  return (
    <section>
      <div className="section-head">
        <h2>Call history</h2>
        <div className="segmented" role="group" aria-label="Filter calls">
          {(["all", "hit", "miss"] as const).map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : f === "hit" ? "Hits" : "Misses"}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="card empty">
          <p className="hint">No {filter === "hit" ? "hits" : "misses"} recorded for this KOL.</p>
        </div>
      ) : null}

      {shown.map((c) => (
        <article key={c.id} className="card call">
          <div className="call-top">
            <span>{stamp(c.postedAt)}</span>
            <span className={`badge ${c.outcome}`}>{c.outcome === "open" ? "OPEN" : c.outcome.toUpperCase()}</span>
          </div>
          <p className="call-quote">&ldquo;{c.text}&rdquo;</p>
          <div className="call-grid">
            <div>
              <p className="label">Claim</p>
              <div className="cell">{c.claim}</div>
            </div>
            <div>
              <p className="label">{PROB_LABEL[c.probabilityKind]}</p>
              <div className="num">{c.probability === null ? "—" : `${Math.round(c.probability * 100)}%`}</div>
            </div>
            <div>
              <p className="label">Price move</p>
              <div className={`num ${c.priceMove === null ? "" : c.priceMove >= 0 ? "tone-pos" : "tone-neg"}`}>
                {c.priceMove === null ? "open" : signed(c.priceMove, 1, true)}
              </div>
            </div>
            <div>
              <p className="label">{c.probabilityKind === "proxy" ? "Proxy edge" : "Edge"}</p>
              <div className={`num ${c.edge === null ? "" : c.edge >= 0 ? "tone-pos" : "tone-neg"}`}>
                {c.edge === null ? "—" : signed(c.edge, 2)}
              </div>
            </div>
          </div>
          <p className="call-foot">
            {c.receipt ? (
              <>
                On-chain receipt ·{" "}
                <a href={txUrl(c.receipt.chainId, c.receipt.txHash)} target="_blank" rel="noreferrer">
                  {shortHex(c.receipt.txHash)}
                </a>
              </>
            ) : c.sample ? (
              <span className="absent">Backtested sample · never written on chain</span>
            ) : (
              <span className="absent">Draft · not on chain</span>
            )}
          </p>
        </article>
      ))}
    </section>
  );
}
