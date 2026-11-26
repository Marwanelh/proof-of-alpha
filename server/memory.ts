/**
 * Living Brain gateway — the memory vertical (Builder B's half of Phase 5).
 *
 * The provider is an MCP server, not a REST API, so the verbs come from `tools/list` rather than from
 * anyone's recollection: `captures_capture` (remember), `workspace_search_pages` (retrieve),
 * `workspace_graph` (connect). Discovered live and recorded in `evidence/livingbrain/tools.json`.
 *
 * Two rules this module exists to enforce:
 *
 *  1. **A capture is asynchronous and stays honest about it.** `captures_capture` returns an ingest source
 *     with a status of pending | compiling | completed | failed. Nothing here reports "compiled" until the
 *     server says completed, so a stuck capture is a visible pending, never a claimed memory.
 *  2. **Provenance travels inside the text.** A remembered call carries its baseline label in the words
 *     themselves (COURNOT BASELINE / PROXY BASELINE — NOT COURNOT / NO RECEIPT — SAMPLE ROW). A memory that
 *     loses its label is how a synthetic number becomes a fact six hours later.
 *
 * The API key is read from the environment, sent only in a request header, and never logged or returned.
 *
 * NOTE on `import "server-only"`: deliberately absent. See scripts/check-boundaries.mjs for the enforcement
 * that replaces it (the package throws under plain Node, which would break the tests and the CLI scripts).
 */

import type { CallRecord } from "../shared/types.ts";

export class MemoryError extends Error {}

export type MemoryConfig = {
  mcpUrl: string;
  apiKey: string;
  subjectId: string;
};

/** Injected everywhere, so no test or build path can reach the network. */
export type MemoryTransport = (tool: string, args: Record<string, unknown>) => Promise<unknown>;

export function memoryConfigFromEnv(): MemoryConfig {
  const apiKey = process.env["LIVING_BRAIN_API_KEY"];
  const subjectId = process.env["LIVING_BRAIN_SUBJECT_ID"];
  const mcpUrl = process.env["LIVING_BRAIN_MCP_URL"] ?? "https://livingbrain.fernmcp.dev/livingbrain";
  if (!apiKey) throw new MemoryError("LIVING_BRAIN_API_KEY is not set");
  if (!subjectId) throw new MemoryError("LIVING_BRAIN_SUBJECT_ID is not set (brains are owned by subjects)");
  return { mcpUrl, apiKey, subjectId };
}

/** MCP replies arrive as plain JSON or as a single SSE event. Normalise both, and surface tool errors. */
function parseReply(payload: string): unknown {
  const trimmed = payload.trim();
  let envelope: unknown;
  if (trimmed.startsWith("{")) {
    envelope = JSON.parse(trimmed);
  } else {
    const line = trimmed.split("\n").find((l) => l.startsWith("data:"));
    envelope = line ? JSON.parse(line.slice(5).trim()) : { raw: trimmed.slice(0, 400) };
  }
  const body = envelope as { result?: { isError?: boolean; structuredContent?: unknown; content?: unknown[] }; error?: unknown };
  if (body.error) throw new MemoryError(`MCP error: ${JSON.stringify(body.error).slice(0, 300)}`);
  const result = body.result;
  if (!result) return envelope;
  if (result.isError) {
    const text = (result.content ?? []).map((c) => (c as { text?: string }).text ?? "").join(" ");
    throw new MemoryError(`tool error: ${text.slice(0, 300) || "unspecified"}`);
  }
  if (result.structuredContent !== undefined) return result.structuredContent;
  const text = (result.content ?? []).map((c) => (c as { text?: string }).text ?? "").find((t) => t !== "");
  if (typeof text === "string") {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return { text };
    }
  }
  return result;
}

/**
 * Real transport. The server's own instructions say it takes an API key plus a subject id, and an earlier
 * probe reached `tools/list` with a bearer header, so all three are sent: servers ignore what they do not
 * use, and guessing wrong here costs a demo.
 */
export function mcpTransport(config: MemoryConfig): MemoryTransport {
  return async (tool, args) => {
    const res = await fetch(config.mcpUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "x-api-key": config.apiKey,
        "x-subject-id": config.subjectId,
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tool, arguments: args } }),
    });
    const text = await res.text();
    if (!res.ok) {
      // Deliberately not echoing the body: a provider error body can quote the request headers back.
      throw new MemoryError(`MCP HTTP ${res.status} calling ${tool}`);
    }
    return parseReply(text);
  };
}

/* ------------------------------------------------------------------- verbs */

export type SourceStatus = "pending" | "compiling" | "completed" | "failed" | "unknown";

export type RememberResult = {
  sourceId: string;
  status: SourceStatus;
  affectedPageIds: string[];
};

export async function listBrains(transport: MemoryTransport): Promise<Array<{ id: string; name?: string }>> {
  const reply = await transport("brains_list", {});
  const items = Array.isArray(reply) ? reply : ((reply as { items?: unknown[] })?.items ?? []);
  return (items as Array<Record<string, unknown>>).map((b) => ({
    id: String(b["id"] ?? b["brainId"] ?? ""),
    ...(typeof b["name"] === "string" ? { name: b["name"] } : {}),
  }));
}

export async function createBrain(transport: MemoryTransport, name: string, description: string): Promise<string> {
  const reply = (await transport("brains_create", { body: { name, description } })) as Record<string, unknown>;
  const id = reply["id"] ?? reply["brainId"];
  if (typeof id !== "string" || id === "") throw new MemoryError("brains_create returned no id");
  return id;
}

/**
 * The text of a remembered call. Every number that could be mistaken for evidence is labelled here, in the
 * memory itself, because this string is what a later retrieval will quote.
 */
export function recordToCapture(record: CallRecord): { label: string; content: string } {
  const c = record.claim;
  const baseline =
    record.kind === "verified"
      ? `${record.cournot.provenance.toUpperCase()} BASELINE · p=${record.cournot.probability} · ${record.cournot.requestId ?? record.cournot.fixtureId}`
      : `PROXY BASELINE — NOT COURNOT · p=${record.proxyBaseline.probability} · ${record.proxyBaseline.methodology}`;

  const receipt =
    record.kind === "verified"
      ? `ON CHAIN · tx ${record.receipt.txHash} · chain ${record.receipt.chainId} · atlasVerified=${record.receipt.atlasVerified}`
      : "NO RECEIPT — SAMPLE ROW";

  const outcome =
    record.resolution === null
      ? "AWAITING DEADLINE"
      : `${record.resolution.result.outcome === 1 ? "CORRECT" : "WRONG"} · ${record.resolution.score.kind} edge ${record.resolution.score.edge} · resolved ${record.resolution.result.resolvedAt}`;

  return {
    label: `${c.authorId} · ${c.asset} ${c.direction} $${c.targetUsd} · ${record.id}`,
    content: [
      `KOL CALL — ${c.authorId}`,
      `Asset ${c.asset}, direction ${c.direction}, target $${c.targetUsd}, deadline ${c.deadline}${c.horizonDefaulted ? " (HORIZON DEFAULTED: the post named no date)" : ""}`,
      `Posted ${c.postedAt} · source ${c.source}`,
      `Original post: ${c.originalText}`,
      `Baseline: ${baseline}`,
      `Outcome: ${outcome}`,
      `Receipt: ${receipt}`,
      `Record kind: ${record.kind}`,
    ].join("\n"),
  };
}

export async function remember(transport: MemoryTransport, brainId: string, record: CallRecord): Promise<RememberResult> {
  const { label, content } = recordToCapture(record);
  const reply = (await transport("captures_capture", {
    brainId,
    body: { content, label, kind: "note", bucket: "notes" },
  })) as Record<string, unknown>;

  const sourceId = reply["sourceId"] ?? reply["id"] ?? (reply["source"] as Record<string, unknown> | undefined)?.["id"];
  if (typeof sourceId !== "string" || sourceId === "") {
    throw new MemoryError("captures_capture returned no source id; refusing to report a memory that may not exist");
  }
  const rawStatus = String(reply["status"] ?? "pending");
  const status = (["pending", "compiling", "completed", "failed"] as const).includes(
    rawStatus as "pending" | "compiling" | "completed" | "failed",
  )
    ? (rawStatus as SourceStatus)
    : "unknown";

  const pages = reply["affectedPageIds"];
  return {
    sourceId,
    status,
    affectedPageIds: Array.isArray(pages) ? pages.map(String) : [],
  };
}

export async function sourceStatus(transport: MemoryTransport, brainId: string, sourceId: string): Promise<SourceStatus> {
  const reply = (await transport("captures_list_sources", { brainId, params: { ids: sourceId } })) as Record<string, unknown>;
  const items = (reply["items"] ?? []) as Array<Record<string, unknown>>;
  const found = items.find((i) => String(i["id"]) === sourceId) ?? items[0];
  const status = found ? String(found["status"]) : "unknown";
  return (["pending", "compiling", "completed", "failed"] as const).includes(status as "pending")
    ? (status as SourceStatus)
    : "unknown";
}

/**
 * Poll until the server reports completed or failed. Returns the TRUE final status: if the budget runs out
 * while the source is still compiling, that is what the caller is told. Reporting "compiled" on a timeout is
 * exactly the fabrication this project refuses.
 */
export async function waitForCompiled(
  transport: MemoryTransport,
  brainId: string,
  sourceId: string,
  opts: { timeoutMs?: number; intervalMs?: number; now?: () => number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<{ status: SourceStatus; waitedMs: number; timedOut: boolean }> {
  const timeoutMs = opts.timeoutMs ?? 45_000;
  const intervalMs = opts.intervalMs ?? 1500;
  const now = opts.now ?? (() => Date.now());
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const started = now();

  for (;;) {
    const status = await sourceStatus(transport, brainId, sourceId);
    if (status === "completed" || status === "failed") {
      return { status, waitedMs: now() - started, timedOut: false };
    }
    if (now() - started >= timeoutMs) {
      return { status, waitedMs: now() - started, timedOut: true };
    }
    await sleep(intervalMs);
  }
}

export type MemoryHit = { slug?: string; title?: string; snippet?: string; similarity?: number };

export async function retrieve(transport: MemoryTransport, brainId: string, query: string, topK = 5): Promise<MemoryHit[]> {
  const reply = await transport("workspace_search_pages", { brainId, body: { query, topK } });
  const items = Array.isArray(reply) ? reply : ((reply as { items?: unknown[] })?.items ?? []);
  return (items as Array<Record<string, unknown>>).map((p) => ({
    ...(typeof p["slug"] === "string" ? { slug: p["slug"] } : {}),
    ...(typeof p["title"] === "string" ? { title: p["title"] } : {}),
    ...(typeof p["snippet"] === "string" ? { snippet: p["snippet"] } : {}),
    ...(typeof p["similarity"] === "number" ? { similarity: p["similarity"] } : {}),
  }));
}

export async function connect(
  transport: MemoryTransport,
  brainId: string,
  nodeLimit = 40,
): Promise<{ nodes: number; edges: number; truncated: boolean }> {
  const reply = (await transport("workspace_graph", { brainId, params: { nodeLimit } })) as Record<string, unknown>;
  const nodes = Array.isArray(reply["nodes"]) ? reply["nodes"].length : 0;
  const edges = Array.isArray(reply["edges"]) ? reply["edges"].length : 0;
  return { nodes, edges, truncated: reply["truncated"] === true };
}

export type HealthFacet = { key: string; label: string; score: number; status?: string };

/**
 * The brain's health score. The server returns named facets (freshness, readiness, …), each with its own
 * numeric score, not a single top-level number, so we report the facets rather than inventing an aggregate.
 */
export async function health(transport: MemoryTransport, brainId: string): Promise<{ facets: HealthFacet[] }> {
  const reply = (await transport("workspace_get_score", { brainId })) as Record<string, unknown>;
  const facets: HealthFacet[] = [];
  for (const value of Object.values(reply)) {
    if (typeof value !== "object" || value === null) continue;
    const f = value as Record<string, unknown>;
    if (typeof f["score"] !== "number") continue;
    facets.push({
      key: String(f["key"] ?? ""),
      label: String(f["label"] ?? f["key"] ?? ""),
      score: f["score"],
      ...(typeof f["status"] === "string" ? { status: f["status"] } : {}),
    });
  }
  return { facets };
}
