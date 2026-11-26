"use client";

import { useState } from "react";
import type { FormEvent } from "react";

import { Receipt } from "../components/Receipt.tsx";
import type { OnChainReceipt, VerificationRecord } from "../shared/types.ts";

type ApiOk = {
  record: Omit<VerificationRecord, "receipt"> & { receipt: OnChainReceipt | null };
  evidenceEligible: boolean;
};

type ApiFailure = {
  state: "refused" | "bad_request" | "provider" | "error";
  message: string;
  provider?: string;
};

const EXAMPLE = "BNB is going above $700 by December 5. Loading up here, this one runs.";

/** What a scorable call needs. Shown on refusal, because a refusal is a designed state, not an error. */
const REQUIREMENTS = [
  "one asset ticker",
  "a direction (bullish or bearish)",
  "a price target in dollars",
  "a deadline that is still in the future",
];

export default function ScorePage() {
  const [text, setText] = useState(EXAMPLE);
  const [authorId, setAuthorId] = useState("sample-kol-alpha");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState<ApiOk | null>(null);
  const [fail, setFail] = useState<ApiFailure | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setOk(null);
    setFail(null);
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, authorId }),
      });
      const payload: unknown = await res.json();
      if (res.ok) setOk(payload as ApiOk);
      else setFail(payload as ApiFailure);
    } catch (e) {
      setFail({ state: "error", message: `could not reach the scoring route: ${String(e)}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <section className="thesis score-intro">
        <h1>Turn a call into a receipt.</h1>
        <p className="lede">Check a crypto prediction against market prices. Each receipt shows the original claim, its deadline, and where the evidence came from.</p>
      </section>

      <div className="workbench">
        <form className="panel call-form" onSubmit={submit}>
          <h2>Score a call</h2>
          <label className="field" htmlFor="kol">
            <span className="label">KOL handle</span>
            <input
              id="kol"
              type="text"
              value={authorId}
              onChange={(e) => setAuthorId(e.target.value)}
              placeholder="who made the call"
              autoComplete="off"
            />
          </label>

          <label className="field" htmlFor="post">
            <span className="label">The post</span>
            <textarea id="post" value={text} onChange={(e) => setText(e.target.value)} />
            <span className="hint">
              Try the sample, or paste a prediction with a price target and deadline.
            </span>
          </label>

          <div className="actions">
            <button type="submit" disabled={busy}>
              {busy ? "Scoring…" : "Score this call"}
            </button>

          </div>
        </form>

        <section className="receipt-stage" aria-label="Scoring result" aria-live="polite" aria-busy={busy}>
          {ok === null && fail === null ? (
            <div className="receipt-preview">
              <header><h2>Call receipt</h2><span className="label">{busy ? "Scoring" : "Preview"}</span></header>
              <p className="hint">{busy ? "Checking the claim and reading the price sources…" : "Score the call to see its evidence."}</p>
              <dl className="preview-fields">
                {["Price target", "Market probability", "Atlas block"].map((field) => (
                  <div key={field}><dt>{field}</dt><dd>Pending</dd></div>
                ))}
              </dl>
              <footer><span className="barcode" aria-hidden="true" />Edge = outcome − probability</footer>
            </div>
          ) : null}

          {fail !== null && fail.state === "refused" ? (
            <div className="refusal">
              <p className="label">Refused</p>
              <h2>Nothing here can be proven wrong.</h2>
              <p>
                That is the point. A call with no target or no deadline can never be scored, so scoring it would
                be inventing a claim the author did not make.
              </p>
              <p className="hint" style={{ marginTop: 12 }}>A scorable call needs:</p>
              <ul>
                {REQUIREMENTS.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {fail !== null && fail.state !== "refused" ? (
            <div className="refusal" style={{ background: "var(--referenced-wash)" }}>
              <p className="label">{fail.provider ? `Provider: ${fail.provider}` : "Request"}</p>
              <h2 style={{ color: "var(--referenced)" }}>Could not complete the receipt</h2>
              <p>{fail.message}</p>
              <p className="hint" style={{ marginTop: 10 }}>
                We stop rather than fill the gap. A receipt with a substituted value would be worse than none.
              </p>
            </div>
          ) : null}

          {ok !== null ? (
            <>
              <Receipt data={{ ...ok.record, receipt: ok.record.receipt }} />
              <p className="hint" style={{ marginTop: 14 }}>
                {ok.evidenceEligible
                  ? "The probability on this receipt came from a real Cournot call and may be cited as evidence."
                  : "The probability on this receipt is a FIXTURE. It is labelled on the value and must not be cited as sponsor evidence."}
              </p>
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}
