"use client";

import { useState } from "react";

import { Stamp } from "./Stamp.tsx";

type Hit = { slug?: string; title?: string; snippet?: string; similarity?: number };

/** The arithmetic the answer is built from, shown beside it so a reader can check the sentence. */
type Facts = {
  calls: number;
  resolved: number;
  correct: number;
  hitRate: number | null;
  cournotCalls: number;
  proxyCalls: number;
  unresolved: number;
  cournotEdge: number | null;
  proxyEdge: number | null;
  baseline: "cournot" | "proxy" | "none";
};

type MemoryState =
  | { kind: "idle" }
  | { kind: "busy"; what: string }
  | { kind: "answer"; text: string; source: "model" | "composed"; model?: string | undefined; modelFailed?: boolean | undefined; facts: Facts; memories: Hit[] }
  | { kind: "hits"; query: string; hits: Hit[] }
  | { kind: "remembered"; sourceId: string; status: string; waitedMs: number; timedOut: boolean }
  | { kind: "problem"; message: string };

/**
 * Ask the record. Two real operations against the Living Brain, and no theatre:
 *
 *  - retrieve: the brain's own semantic search over what it has compiled.
 *  - remember: pushes this KOL's calls and reports the ingest status the SERVER returned. A capture that is
 *    still compiling says so, with the elapsed time. The panel never prints "remembered" for a capture the
 *    brain has not finished.
 */
export function MemoryPanel({ kolId, calls }: { kolId: string; calls: number }) {
  const [query, setQuery] = useState(`what has ${kolId} called, and what was the baseline?`);
  const [state, setState] = useState<MemoryState>({ kind: "idle" });

  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/memory", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { ok: res.ok, payload: (await res.json()) as Record<string, unknown> };
  }

  async function ask() {
    setState({ kind: "busy", what: "retrieving from the brain and writing the answer" });
    try {
      const { ok, payload } = await post({ action: "ask", kolId, query });
      if (!ok) {
        setState({ kind: "problem", message: String(payload["message"] ?? "the answer failed") });
        return;
      }
      setState({
        kind: "answer",
        text: String(payload["text"] ?? ""),
        source: payload["source"] === "model" ? "model" : "composed",
        model: typeof payload["model"] === "string" ? payload["model"] : undefined,
        modelFailed: payload["modelFailed"] === true,
        facts: payload["facts"] as Facts,
        memories: (payload["memories"] ?? []) as Hit[],
      });
    } catch (e) {
      setState({ kind: "problem", message: String(e) });
    }
  }

  async function remember() {
    setState({ kind: "busy", what: "capturing and waiting for the brain to compile" });
    try {
      const { ok, payload } = await post({ action: "remember", kolId, wait: true });
      if (!ok) {
        setState({ kind: "problem", message: String(payload["message"] ?? "capture failed") });
        return;
      }
      setState({
        kind: "remembered",
        sourceId: String(payload["sourceId"]),
        status: String(payload["status"]),
        waitedMs: Number(payload["waitedMs"] ?? 0),
        timedOut: payload["timedOut"] === true,
      });
    } catch (e) {
      setState({ kind: "problem", message: String(e) });
    }
  }

  return (
    <section className="panel" style={{ marginTop: 28 }}>
      <p className="label">Agent memory</p>
      <h2 style={{ marginBottom: 8 }}>Ask the record</h2>
      <p className="hint" style={{ marginTop: 0, marginBottom: 14, maxWidth: "62ch" }}>
        This KOL&rsquo;s calls live in a Living Brain knowledge vault. Retrieval below is the brain&rsquo;s own
        semantic search, and a capture is asynchronous: remember reports the ingest status the provider
        returned, including when it is still compiling.
      </p>

      <label className="field" htmlFor="q">
        <span className="label">Question</span>
        <input id="q" type="text" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>

      <div className="actions" style={{ marginBottom: 16 }}>
        <button type="button" onClick={remember} disabled={state.kind === "busy"}>
          Remember these {calls} call{calls === 1 ? "" : "s"}
        </button>
        <button type="button" className="ghost" onClick={ask} disabled={state.kind === "busy"}>
          Ask the brain
        </button>
      </div>

      {state.kind === "busy" ? <p className="hint">{state.what}…</p> : null}

      {state.kind === "problem" ? (
        <div className="refusal" style={{ background: "var(--referenced-wash)" }}>
          <h2 style={{ color: "var(--referenced)", fontSize: 15 }}>The brain did not answer</h2>
          <p style={{ marginBottom: 0 }}>{state.message}</p>
        </div>
      ) : null}

      {state.kind === "remembered" ? (
        <div className="receipt" style={{ marginBottom: 16 }}>
          <div className="receipt-head">
            <div>
              <p className="label">Capture</p>
              <h2 className="kol" style={{ fontSize: 15 }}>{state.sourceId}</h2>
            </div>
            {state.status === "completed" ? (
              <Stamp state="verified">Compiled</Stamp>
            ) : (
              <Stamp state="referenced">Still {state.status}</Stamp>
            )}
          </div>
          <div className="receipt-foot" style={{ borderTop: 0 }}>
            <p className="hint" style={{ margin: 0 }}>
              {state.status === "completed"
                ? `The brain finished compiling this capture ${(state.waitedMs / 1000).toFixed(1)}s after it was queued.`
                : `The provider reports "${state.status}" after ${(state.waitedMs / 1000).toFixed(1)}s. It has not finished compiling, and we will not say otherwise.`}
            </p>
          </div>
        </div>
      ) : null}

      {state.kind === "answer" ? (
        <div className="receipt" style={{ marginBottom: 16 }}>
          <div className="receipt-head" style={{ alignItems: "flex-start" }}>
            <div style={{ maxWidth: "62ch" }}>
              <p className="label">Answer</p>
              <p style={{ margin: "2px 0 0", fontSize: 14.5 }}>{state.text}</p>
            </div>
            <Stamp state={state.source === "model" ? "verified" : "referenced"}>
              {state.source === "model" ? `Written by ${state.model ?? "a model"}` : "Composed from the records"}
            </Stamp>
          </div>

          <div className="receipt-body">
            <dl className="row">
              <dt>Calls</dt>
              <dd>
                <span className="value">{state.facts.calls}</span>
                <span className="hint"> {state.facts.resolved} resolved · {state.facts.unresolved} open</span>
              </dd>
              <dd>
                {state.facts.baseline === "cournot" ? (
                  <Stamp state="verified">Cournot × {state.facts.cournotCalls}</Stamp>
                ) : state.facts.baseline === "proxy" ? (
                  <Stamp state="referenced">Proxy only × {state.facts.proxyCalls}</Stamp>
                ) : (
                  <Stamp state="refused">No baseline</Stamp>
                )}
              </dd>
            </dl>
            <dl className="row">
              <dt>Cournot edge</dt>
              <dd>
                <span className="value">
                  {state.facts.cournotEdge === null ? "no baseline" : state.facts.cournotEdge.toFixed(3)}
                </span>
              </dd>
              <dd>
                {state.facts.cournotEdge === null ? (
                  <Stamp state="referenced">Not a track record</Stamp>
                ) : (
                  <Stamp state="verified">From the market</Stamp>
                )}
              </dd>
            </dl>
            <dl className="row">
              <dt>Hit rate</dt>
              <dd>
                <span className="value">
                  {state.facts.hitRate === null ? "—" : `${(state.facts.hitRate * 100).toFixed(0)}%`}
                </span>
                <span className="hint"> {state.facts.correct} of {state.facts.resolved} resolved</span>
              </dd>
              <dd />
            </dl>
          </div>

          <div className="receipt-foot">
            <p className="hint" style={{ margin: 0 }}>
              {state.source === "model"
                ? "The numbers above are computed from the records and handed to the model; the sentence is its prose about them."
                : "Written from the records without a model: every number above is arithmetic over this KOL's calls."}
              {state.modelFailed === true
                ? " A model was configured but failed, so the composed answer is shown instead."
                : ""}
              {state.memories.length > 0 ? ` Brain pages used: ${state.memories.slice(0, 4).map((m) => m.title ?? m.slug ?? "page").join(", ")}.` : ""}
            </p>
          </div>
        </div>
      ) : null}

      {state.kind === "hits" ? (
        state.hits.length === 0 ? (
          <p className="hint">
            The brain returned no page for that question. Nothing has been compiled for this KOL yet, or the
            similarity floor excluded everything.
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 12 }}>
            {state.hits.map((h, i) => (
              <li key={h.slug ?? i}>
                <div style={{ display: "flex", gap: 10, alignItems: "baseline", justifyContent: "space-between" }}>
                  <span className="kol">{h.title ?? h.slug ?? "(untitled page)"}</span>
                  {typeof h.similarity === "number" ? (
                    <span className="absent">similarity {h.similarity.toFixed(2)}</span>
                  ) : null}
                </div>
                {h.snippet ? <p className="hint" style={{ margin: "2px 0 0" }}>{h.snippet}</p> : null}
              </li>
            ))}
          </ul>
        )
      ) : null}
    </section>
  );
}
