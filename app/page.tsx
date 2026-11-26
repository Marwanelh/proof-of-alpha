"use client";

import { useEffect, useRef, useState } from "react";
import type { ClipboardEvent, FormEvent } from "react";

import { Receipt } from "../components/Receipt.tsx";
import { cleanPastedPost } from "../shared/clean.ts";
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

const EXAMPLE = "BNB to $1,200 before New Year. Accumulating every dip. — CryptoNova";

const REQUIREMENTS = [
  "one asset ticker (BNB, CAKE, BTC, ETH…)",
  "a stance on its price: bullish or bearish (a target and a date make it sharper, but are optional)",
];

const STEPS = ["Extract the claim", "Market probability", "CMC + Atlas prices", "Record on BNB Chain"] as const;

type StepState = "idle" | "active" | "done" | "skipped" | "failed";

/** "… — CryptoNova", "… - @CryptoNova", "… via CryptoNova" -> "CryptoNova". The post body is left as written. */
function authorFrom(text: string): string | null {
  const m = text.trim().match(/(?:[—–-]|\bvia\b)\s*@?([A-Za-z0-9_.]{2,32})\s*$/);
  return m ? m[1]! : null;
}

export default function VerifyPage() {
  const [text, setText] = useState(EXAMPLE);
  const [authorId, setAuthorId] = useState("CryptoNova");
  const [authorTouched, setAuthorTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [ok, setOk] = useState<ApiOk | null>(null);
  const [fail, setFail] = useState<ApiFailure | null>(null);
  const [cleanNote, setCleanNote] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (authorTouched) return;
    const found = authorFrom(text);
    if (found) setAuthorId(found);
  }, [text, authorTouched]);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  /** Copying a post off a page drags its buttons and price widgets along; keep only the post. */
  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const raw = e.clipboardData.getData("text");
    if (!raw.includes("\n") && raw.length < 400) return; // a plain sentence: let the browser paste it
    e.preventDefault();
    const c = cleanPastedPost(raw);
    setText(c.text);
    if (c.author && !authorTouched) setAuthorId(c.author);
    setCleanNote(
      c.dropped > 0
        ? `Cleaned the paste: removed ${c.dropped} buttons, counts and price widgets${c.sentiment ? `, kept the ${c.sentiment} tag` : ""}${c.author ? `, author ${c.author}` : ""}. Edit anything that is wrong.`
        : null,
    );
  }

  function reset() {
    setCleanNote(null);
    setText("");
    setAuthorId("");
    setAuthorTouched(false);
    setOk(null);
    setFail(null);
    setTick(0);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setOk(null);
    setFail(null);
    setTick(0);
    // The route is one request; the step indicator walks while it runs and settles on the real outcome.
    timer.current = setInterval(() => setTick((t) => Math.min(t + 1, STEPS.length - 1)), 700);
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
      if (timer.current) clearInterval(timer.current);
      setBusy(false);
    }
  }

  const steps: { state: StepState; note: string }[] = STEPS.map((_, i) => {
    if (busy) return { state: i < tick ? "done" : i === tick ? "active" : "idle", note: i === tick ? "working…" : "" };
    if (fail) {
      if (fail.state === "refused" || fail.state === "bad_request") return { state: i === 0 ? "failed" : "idle", note: i === 0 ? "refused" : "" };
      const at = fail.provider === "cournot" ? 1 : fail.provider === "cmc" || fail.provider === "atlas" ? 2 : fail.provider === "registry" ? 3 : 0;
      return { state: i < at ? "done" : i === at ? "failed" : "idle", note: i === at ? `${fail.provider ?? "error"} failed` : "" };
    }
    if (ok) {
      const r = ok.record;
      if (i === 0) return { state: "done", note: `${r.claim.asset} ${r.claim.direction}` };
      if (i === 1) return ok.evidenceEligible ? { state: "done", note: `Cournot ${(r.cournot.probability * 100).toFixed(0)}%` } : { state: "skipped", note: "fixture · not live" };
      if (i === 2) return { state: "done", note: `$${Number(r.cmc.priceUsd).toFixed(2)}` };
      return r.receipt ? { state: "done", note: "confirmed" } : { state: "skipped", note: "draft · not on chain" };
    }
    return { state: "idle", note: "" };
  });
  const doneCount = steps.filter((s) => s.state === "done").length;

  return (
    <main className="shell-narrow">
      <section className="page-head">
        <h1>Verify a call</h1>
        <p>
          Paste a post from CMC Community, Telegram or anywhere else. The agent turns it into a claim, prices it,
          and records it on BNB Chain before the outcome is known.
        </p>
      </section>

      <form className="card post-card" onSubmit={submit}>
        <label className="field" htmlFor="post" style={{ marginBottom: 0 }}>
          <span className="label">Post</span>
          <textarea
            id="post"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={onPaste}
            placeholder="Select the whole post on CMC Community and paste it here: buttons, counts and price widgets are removed for you."
          />
          {cleanNote ? <span className="hint" style={{ color: "var(--lime)" }}>{cleanNote}</span> : null}
        </label>
        <div className="author-row">
          <label className="label" htmlFor="kol">KOL</label>
          <input
            id="kol"
            type="text"
            value={authorId}
            onChange={(e) => {
              setAuthorTouched(true);
              setAuthorId(e.target.value);
            }}
            placeholder="who made the call (read from “— Name” at the end of the post)"
            autoComplete="off"
          />
        </div>
        <div className="actions">
          <button type="submit" disabled={busy}>{busy ? "Analyzing…" : "Analyze post"}</button>
          <button type="button" className="ghost" onClick={reset} disabled={busy}>Reset</button>
          <span className="hint">Step {busy ? tick + 1 : doneCount} of {STEPS.length}</span>
        </div>
      </form>

      {busy || ok || fail ? (
        <ol className="steps" aria-label="Progress" style={{ listStyle: "none", padding: 0 }}>
          {STEPS.map((label, i) => (
            <li key={label} className="step" data-state={steps[i]!.state}>
              <b>{steps[i]!.state === "done" ? "✓" : steps[i]!.state === "failed" ? "✕" : steps[i]!.state === "skipped" ? "!" : `0${i + 1}`} {steps[i]!.note}</b>
              {label}
            </li>
          ))}
        </ol>
      ) : null}

      <section aria-live="polite" aria-busy={busy} style={{ marginTop: 8 }}>
        {fail !== null && (fail.state === "refused" || fail.state === "bad_request") ? (
          <div className="refusal">
            <p className="label" style={{ color: "var(--orange)" }}>Refused</p>
            <h2>Nothing here can be proven wrong.</h2>
            <p>
              {fail.state === "bad_request"
                ? fail.message
                : "This post takes no position on where a tracked coin is going. News, announcements and posts about stocks are not calls, and scoring one would invent a prediction the author never made."}
            </p>
            <p className="hint" style={{ marginTop: 12 }}>A scorable call needs:</p>
            <ul>
              {REQUIREMENTS.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {fail !== null && fail.state !== "refused" && fail.state !== "bad_request" ? (
          <div className="refusal">
            <p className="label" style={{ color: "var(--orange)" }}>{fail.provider ? `Provider: ${fail.provider}` : "Request"}</p>
            <h2>Could not complete the receipt</h2>
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
                ? "The probability on this receipt came from a real Cournot call."
                : "The probability on this receipt is a FIXTURE, labelled on the value. It is not Cournot evidence and the call will not be scored as Cournot Edge."}
            </p>
          </>
        ) : null}
      </section>
    </main>
  );
}
