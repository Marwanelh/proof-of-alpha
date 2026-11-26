"use client";

import { useState } from "react";
import type { FormEvent } from "react";

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

type Hit = { slug?: string; title?: string };

type MemoryState =
  | { kind: "idle" }
  | { kind: "busy"; what: string }
  | { kind: "answer"; text: string; source: "model" | "composed"; model?: string | undefined; modelFailed?: boolean | undefined; facts: Facts; memories: Hit[] }
  | { kind: "remembered"; sourceId: string; status: string; waitedMs: number }
  | { kind: "problem"; message: string };

/**
 * Ask the agent about a KOL. The answer's numbers are computed from the records (the facts line under it);
 * Living Brain supplies the remembered context, and a model only writes the sentence. "Remember" pushes this
 * KOL's calls into the brain and reports the status the provider returned, never a claimed success.
 */
export function MemoryPanel({ kolId, calls }: { kolId: string; calls: number }) {
  const [query, setQuery] = useState(`Is ${kolId}'s next BNB call worth following?`);
  const [state, setState] = useState<MemoryState>({ kind: "idle" });

  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/memory", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { ok: res.ok, payload: (await res.json()) as Record<string, unknown> };
  }

  async function ask(e?: FormEvent) {
    e?.preventDefault();
    setState({ kind: "busy", what: "Reading the brain and the record…" });
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
    } catch (err) {
      setState({ kind: "problem", message: String(err) });
    }
  }

  async function remember() {
    setState({ kind: "busy", what: "Capturing into Living Brain and waiting for it to compile…" });
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
      });
    } catch (err) {
      setState({ kind: "problem", message: String(err) });
    }
  }

  const busy = state.kind === "busy";

  return (
    <div className="card card-pad">
      <p className="card-title">Ask the agent about this KOL</p>
      <form onSubmit={ask}>
        <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Question" />
        <div className="actions" style={{ marginTop: 10 }}>
          <button type="submit" disabled={busy} style={{ padding: "9px 16px", fontSize: 14 }}>Ask</button>
          <button type="button" className="ghost" onClick={remember} disabled={busy} style={{ padding: "9px 14px", fontSize: 13.5 }}>
            Remember {calls} call{calls === 1 ? "" : "s"}
          </button>
        </div>
      </form>

      {state.kind === "busy" ? <div className="answer hint">{state.what}</div> : null}

      {state.kind === "problem" ? (
        <div className="answer" style={{ color: "var(--orange)" }}>The brain did not answer: {state.message}</div>
      ) : null}

      {state.kind === "remembered" ? (
        <div className="answer">
          {state.status === "completed"
            ? `Remembered. Living Brain compiled capture ${state.sourceId.slice(0, 8)}… in ${(state.waitedMs / 1000).toFixed(1)}s.`
            : `Living Brain reports "${state.status}" after ${(state.waitedMs / 1000).toFixed(1)}s. It has not finished compiling yet.`}
        </div>
      ) : null}

      {state.kind === "answer" ? (
        <>
          <div className="answer">{state.text}</div>
          <p className="answer-meta">
            {state.facts.resolved} resolved of {state.facts.calls} ·{" "}
            {state.facts.cournotEdge !== null
              ? `Cournot Edge ${state.facts.cournotEdge.toFixed(2)}`
              : state.facts.proxyEdge !== null
                ? `proxy Edge ${state.facts.proxyEdge.toFixed(2)} (not Cournot)`
                : "no baseline"}
            {" · "}
            {state.source === "model" ? `written by ${state.model ?? "a model"} from computed numbers` : "composed from the records"}
            {state.modelFailed ? " (model request failed)" : ""}
            {state.memories.length > 0 ? ` · brain pages: ${state.memories.slice(0, 3).map((m) => m.title ?? m.slug ?? "page").join(", ")}` : ""}
          </p>
        </>
      ) : null}
    </div>
  );
}
