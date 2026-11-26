"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";

import { cleanPastedPost } from "../shared/clean.ts";
import type { AtlasSnapshot, Claim, CournotResponse } from "../shared/types.ts";

type PricePoint = { priceUsd: string; observedAt: string };
type Baseline =
  | { kind: "proxy"; probability: number; label: string; methodology: string }
  | { kind: "cournot"; probability: number; cournot: CournotResponse; live: boolean };
type Verdict =
  | { state: "resolved"; hit: boolean; atDeadline: PricePoint; edge: number }
  | { state: "open"; winningNow: boolean; distancePct: number };
type CheckOk = { claim: Claim; atPost: PricePoint; now: PricePoint; atlasNow: AtlasSnapshot | null; baseline: Baseline; verdict: Verdict };
type CheckFail = { state: "refused" | "bad_request" | "provider" | "error"; message: string };

const REPO_ISSUES = "https://github.com/Marwanelh/proof-of-alpha/issues/new";
/**
 * A real CMC Community post, copied the way the page shows it: the poster, their handle and the timestamp, then
 * the post. The first click shows a settled call, and the example teaches what to paste.
 */
const EXAMPLE_RAW = `Alek Carter
@Alek_Carter
· Nov 23

$ETH is gearing up for a major breakout.

Bulls are back in control. $1,844 is the key level to watch.

Entry: $1,820
TP1: $1,844
TP2: $1,880
TP3: $1,980
SL: $1,710

Break $1,844 and things could get explosive.`;
const STEPS = ["Read the claim", "Price at posting", "Baseline probability", "Verdict"] as const;

function authorFrom(text: string): string | null {
  const m = text.trim().match(/(?:[—–-]|\bvia\b)\s*@?([A-Za-z0-9_.]{2,32})\s*$/);
  return m ? m[1]! : null;
}

const usd = (s: string) => {
  const n = Number(s);
  return `$${n >= 1 ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : n.toPrecision(4)}`;
};
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }) + " BKK";
const pct = (p: number) => `${Math.round(p * 100)}%`;
const signed = (v: number, d = 2) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v).toFixed(d)}`;

function Row({ label, children, note }: { label: string; children: ReactNode; note?: ReactNode }) {
  return (
    <dl className="row">
      <dt>{label}</dt>
      <dd>{children}</dd>
      <dd>{note ?? null}</dd>
    </dl>
  );
}

export default function VerifyPage() {
  const [text, setText] = useState(EXAMPLE_RAW);
  const [authorId, setAuthorId] = useState("Alek_Carter");
  const [authorTouched, setAuthorTouched] = useState(false);
  const [sourceUrl, setSourceUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [ok, setOk] = useState<CheckOk | null>(null);
  const [fail, setFail] = useState<CheckFail | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // The box keeps exactly what was pasted; what we read from it (poster, time, the post itself) is shown below.
  const reading = useMemo(() => cleanPastedPost(text), [text]);

  useEffect(() => {
    if (authorTouched) return;
    const found = reading.author ?? authorFrom(reading.text);
    if (found) setAuthorId(found);
  }, [reading, authorTouched]);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  function reset() {
    setText("");
    setAuthorId("");
    setAuthorTouched(false);
    setSourceUrl("");
    setOk(null);
    setFail(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setOk(null);
    setFail(null);
    setTick(0);
    timer.current = setInterval(() => setTick((t) => Math.min(t + 1, STEPS.length - 1)), 900);
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text,
          authorId,
          // The time comes from the post itself ("· Nov 23", "· 7h"); with none, the call is checked as of now.
          postedAt: reading.posted?.at,
        }),
      });
      const payload: unknown = await res.json();
      if (res.ok) setOk(payload as CheckOk);
      else setFail(payload as CheckFail);
    } catch (e) {
      setFail({ state: "error", message: `could not reach the checker: ${String(e)}` });
    } finally {
      if (timer.current) clearInterval(timer.current);
      setBusy(false);
    }
  }

  const reviewUrl = ok
    ? `${REPO_ISSUES}?${new URLSearchParams({
        title: `Submission: ${ok.claim.authorId} — ${ok.claim.asset} ${ok.claim.direction}`,
        labels: "submission",
        body: [
          `**KOL:** ${ok.claim.authorId}`,
          `**Posted at:** ${ok.claim.postedAt}`,
          `**Source URL (required for review):** ${sourceUrl || "<paste the CMC post link>"}`,
          `**Claim as read:** ${ok.claim.asset} ${ok.claim.direction} · target $${ok.claim.targetUsd}${ok.claim.targetSource === "price-at-posting" ? " (price at posting)" : ""} · deadline ${ok.claim.deadline}${ok.claim.horizonDefaulted ? " (default)" : ""}`,
          "",
          "**Post:**",
          "```",
          ok.claim.originalText,
          "```",
        ].join("\n"),
      }).toString()}`
    : "";

  return (
    <main className="shell-narrow">
      <section className="page-head">
        <h1>Verify a call</h1>
        <p>
          Paste a post from CMC Community, Telegram or anywhere else, with its timestamp. We read the claim,
          price it then and now, and tell you whether it was right against a volatility baseline. Checks are not
          recorded: calls on the leaderboard are reviewed, priced by Cournot and locked on BNB Chain.
        </p>
      </section>

      <form className="card post-card" onSubmit={submit}>
        <label className="field" htmlFor="post" style={{ marginBottom: 0 }}>
          <span className="label">Post</span>
          <textarea
            id="post"
            value={text}
            onChange={(e) => setText(e.target.value)}
            style={{ minHeight: 220 }}
            placeholder={"BuySome_BTC\n@BuySome_BTC\n· 7h\n\n$BNB to $700 by end of month. Loading up.\n\nCopy the poster, @handle and timestamp together with the post."}
          />
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
            placeholder="who made the call (read from “— Name” or @handle)"
            autoComplete="off"
          />
          <span className="hint" style={{ color: reading.posted ? "var(--lime)" : undefined }}>
            {reading.posted
              ? `Posted ${reading.posted.raw.replace(/^[·•]\s*/, "")} — read from the post${reading.posted.dayOnly ? " (the page shows the day only, so it is priced at 12:00 Bangkok)" : ""}.`
              : "No timestamp found: copy the poster, @handle and “· 7h” / “· Nov 23” line with the post. Without one it is checked as posted just now."}
            {reading.dropped > 0 ? ` Ignoring ${reading.dropped} line${reading.dropped === 1 ? "" : "s"} of page chrome (name, handle, time, buttons, counts).` : ""}
          </span>
        </div>

        <div className="actions">
          <button type="submit" disabled={busy}>{busy ? "Checking…" : "Analyze post"}</button>
          <button type="button" className="ghost" onClick={reset} disabled={busy}>Reset</button>
          <span className="hint">Step {busy ? tick + 1 : ok ? STEPS.length : 0} of {STEPS.length}</span>
        </div>
      </form>

      {busy || ok ? (
        <ol className="steps" aria-label="Progress" style={{ listStyle: "none", padding: 0 }}>
          {STEPS.map((label, i) => {
            const state = ok ? "done" : i < tick ? "done" : i === tick ? "active" : "idle";
            return (
              <li key={label} className="step" data-state={state}>
                <b>{state === "done" ? "✓" : `0${i + 1}`}</b>
                {label}
              </li>
            );
          })}
        </ol>
      ) : null}

      <section aria-live="polite" aria-busy={busy} style={{ marginTop: 8 }}>
        {fail ? (
          <div className="refusal">
            <p className="label" style={{ color: "var(--orange)" }}>{fail.state === "refused" ? "Refused" : "Could not check"}</p>
            <h2>{fail.state === "refused" ? "Nothing here can be proven wrong." : "The check did not complete"}</h2>
            <p>{fail.message}</p>
          </div>
        ) : null}

        {ok ? (
          <article className="receipt">
            <div className="receipt-head">
              <div>
                <p className="label">Check · not recorded</p>
                <h2>
                  {ok.claim.authorId}: {ok.claim.asset} {ok.claim.direction}
                </h2>
              </div>
              {ok.verdict.state === "resolved" ? (
                <span className={`badge ${ok.verdict.hit ? "hit" : "miss"}`} style={{ fontSize: 15, padding: "6px 14px" }}>
                  {ok.verdict.hit ? "RIGHT" : "WRONG"}
                </span>
              ) : (
                <span className="badge open" style={{ fontSize: 15, padding: "6px 14px" }}>
                  OPEN · {ok.verdict.winningNow ? "winning now" : "not there yet"}
                </span>
              )}
            </div>

            <div className="receipt-body">
              <Row label="Post">
                <span style={{ fontSize: 14 }}>“{ok.claim.originalText}”</span>
              </Row>
              <Row
                label="Claim"
                note={
                  <span className="stamp" data-state={ok.claim.extractor && ok.claim.extractor !== "rules" ? "verified" : "referenced"}>
                    {ok.claim.extractor && ok.claim.extractor !== "rules" ? `Read by AI · ${ok.claim.extractor.split("/").pop()}` : "Read by rules"}
                  </span>
                }
              >
                {ok.claim.targetSource === "price-at-posting"
                  ? `${ok.claim.asset} ${ok.claim.direction === "bullish" ? "higher" : "lower"} than ${usd(ok.claim.targetUsd)} (price at posting — no target named)`
                  : `${ok.claim.asset} ${ok.claim.direction === "bullish" ? "at or above" : "at or below"} ${usd(ok.claim.targetUsd)}`}
              </Row>
              <Row
                label="Deadline"
                note={
                  <span className="stamp" data-state={ok.claim.horizonDefaulted ? "referenced" : "verified"}>
                    {ok.claim.horizonDefaulted ? "No date named · 24h mark" : "Stated"}
                  </span>
                }
              >
                {when(ok.claim.deadline)}
              </Row>
              <Row label="At posting" note={<span className="stamp" data-state="verified">CMC · {when(ok.atPost.observedAt)}</span>}>
                <span className="value">{usd(ok.atPost.priceUsd)}</span>
              </Row>
              {ok.verdict.state === "resolved" ? (
                <Row label="At deadline" note={<span className="stamp" data-state="verified">CMC history</span>}>
                  <span className="value">{usd(ok.verdict.atDeadline.priceUsd)}</span>
                  <span className="hint"> {ok.verdict.hit ? "On the claimed side of the target." : "Not on the claimed side of the target."}</span>
                </Row>
              ) : (
                <Row label="Now" note={<span className="stamp" data-state="verified">CMC live</span>}>
                  <span className="value">{usd(ok.now.priceUsd)}</span>
                  <span className="hint">
                    {" "}
                    {ok.verdict.winningNow
                      ? "Already on the claimed side — it still has to hold until the deadline."
                      : `${Math.abs(ok.verdict.distancePct).toFixed(2)}% away from the target.`}
                  </span>
                </Row>
              )}
              {ok.atlasNow ? (
                <Row label="Atlas now" note={<span className="stamp" data-state="referenced">Atlas · block {ok.atlasNow.mainnetBlock}</span>}>
                  <span className="value">${(Number(BigInt(ok.atlasNow.price)) / 10 ** ok.atlasNow.decimals).toFixed(2)}</span>
                  <span className="hint"> On-chain BNB/USD on BSC mainnet, a second source for the current price.</span>
                </Row>
              ) : null}
              <Row
                label="Market expected"
                note={
                  ok.baseline.kind === "proxy" ? (
                    <span className="stamp" data-state="referenced">Proxy · not Cournot</span>
                  ) : ok.baseline.live ? (
                    <span className="stamp" data-state="verified">Cournot · real</span>
                  ) : (
                    <span className="stamp" data-state="referenced">Fixture · not live</span>
                  )
                }
              >
                <span className="value">{pct(ok.baseline.probability)}</span>
                <span className="hint">
                  {" "}
                  {ok.baseline.kind === "proxy"
                    ? ok.baseline.methodology
                    : ok.baseline.live
                      ? `Cournot evaluated: “${ok.baseline.cournot.evaluatedClaim}”.`
                      : "Cournot has not priced this exact claim; this is a labelled fixture, not Cournot's number."}
                </span>
              </Row>
              {ok.verdict.state === "resolved" ? (
                <Row label="Edge">
                  <span className={`value ${ok.verdict.edge >= 0 ? "tone-pos" : "tone-neg"}`}>{signed(ok.verdict.edge)}</span>
                  <span className="hint">
                    {" "}
                    outcome ({ok.verdict.hit ? 1 : 0}) − expected ({ok.baseline.probability.toFixed(2)}).{" "}
                    {ok.verdict.hit && ok.baseline.probability >= 0.7
                      ? "Right, but the market already expected it."
                      : ok.verdict.hit
                        ? "Right against the odds: that is real edge."
                        : ok.baseline.probability >= 0.5
                          ? "A confident call that missed."
                          : "A long shot that missed."}
                  </span>
                </Row>
              ) : (
                <Row label="Edge">
                  <span className="hint">
                    Settles at the deadline: {signed(1 - ok.baseline.probability)} if right, {signed(-ok.baseline.probability)} if wrong.
                  </span>
                </Row>
              )}
            </div>

            <div className="receipt-foot">
              <div className="actions" style={{ justifyContent: "space-between" }}>
                <span className="hint" style={{ maxWidth: "52ch" }}>
                  This check is not on the leaderboard. Submit it with the link to the original post and we review it:
                  a pasted post alone does not prove who wrote it.
                </span>
                <div className="actions">
                  <input
                    type="text"
                    value={sourceUrl}
                    onChange={(e) => setSourceUrl(e.target.value)}
                    placeholder="https://coinmarketcap.com/community/post/…"
                    aria-label="Link to the original post"
                    style={{ width: 280, padding: "9px 12px", fontSize: 14 }}
                  />
                  <a className="btn" href={reviewUrl} target="_blank" rel="noreferrer" style={{ padding: "9px 16px", fontSize: 14 }}>
                    Submit for review ↗
                  </a>
                </div>
              </div>
            </div>
          </article>
        ) : null}
      </section>
    </main>
  );
}
