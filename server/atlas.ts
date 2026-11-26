/**
 * Atlas gateway — one mainnet MultiFeed snapshot, read over a keyless public RPC.
 *
 * Verified facts this file encodes (docs/integration-findings.md §2b), each of which was a trap:
 *  - the free feeds are MultiFeed, so `latestRoundData()` REVERTS; the call is `fetch(bytes4 feedId)`
 *  - the read selector is 0x7ffc4b97 followed by the 4-byte feedId, zero-padded to a word
 *  - the catalogue number in the UI (#1164) is NOT the feedId; passing it reverts
 *  - an unknown feedId reverts with an empty reason; a known-but-never-updated feed returns zeros
 *
 * Reads are free and need no account, which is what satisfies the Atlas requirement on its own.
 *
 * NOTE: add `import "server-only"` here once the Next app lands.
 */

import type { AtlasSnapshot } from "../shared/types.ts";

/** keccak256("fetch(bytes4)")[0:4], computed and verified against the live proxy. */
const SEL_FETCH = "0x7ffc4b97";
const DEFAULT_RPC = "https://bsc-dataseed.binance.org";

export class AtlasError extends Error {}

export type AtlasConfig = {
  feedAddress: string;
  feedId: string; // 8 hex chars, e.g. "0x0000048c"
  rpcUrl?: string;
};

/** Injected so the test never touches the network. */
export type RpcCall = (to: string, data: string) => Promise<string>;

export async function readAtlas(config: AtlasConfig, rpcCall: RpcCall = jsonRpcCall(config)): Promise<AtlasSnapshot> {
  const feedAddress = requireAddress(config.feedAddress);
  const feedId = requireFeedId(config.feedId);

  const word = await rpcCall(feedAddress, SEL_FETCH + feedId.slice(2).padStart(8, "0"));
  if (!word || word === "0x") {
    throw new AtlasError(
      `fetch(${feedId}) reverted on ${feedAddress}. An empty revert means the feedId is wrong — the catalogue number is not the on-chain id.`,
    );
  }
  const words = decodeWords(word);
  if (words.length < 3) throw new AtlasError(`unexpected snapshot length from ${feedAddress}: ${word.slice(0, 20)}…`);

  const price = words[0]!;
  const aggregatedTs = Number(words[1]!);
  const onchainTs = Number(words[2]!);
  if (price === 0n || onchainTs === 0) {
    throw new AtlasError(`${feedId} has never been updated (zero snapshot)`);
  }

  return {
    feedAddress,
    feedId,
    price: price.toString(),
    decimals: await readDecimals(config, rpcCall),
    aggregatedTs,
    onchainTs,
    mainnetBlock: String(await latestBlock(config, rpcCall)),
  };
}

const SEL_DECIMALS = "0x313ce567";

async function readDecimals(config: AtlasConfig, rpcCall: RpcCall): Promise<number> {
  const word = await rpcCall(requireAddress(config.feedAddress), SEL_DECIMALS);
  const words = decodeWords(word);
  if (words.length === 0) throw new AtlasError("decimals() returned nothing");
  return Number(words[0]!);
}

async function latestBlock(config: AtlasConfig, rpcCall: RpcCall): Promise<bigint> {
  const rpcUrl = config.rpcUrl ?? process.env["BSC_MAINNET_RPC"] ?? DEFAULT_RPC;
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
  });
  const body = (await res.json()) as { result?: string };
  if (typeof body.result !== "string") throw new AtlasError("could not read the mainnet block number");
  return BigInt(body.result);
}

/** Default transport: a plain keyless JSON-RPC POST. Nothing here needs a credential. */
function jsonRpcCall(config: AtlasConfig): RpcCall {
  const rpcUrl = config.rpcUrl ?? process.env["BSC_MAINNET_RPC"] ?? DEFAULT_RPC;
  return async (to: string, data: string): Promise<string> => {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
    });
    const body = (await res.json()) as { result?: string; error?: { message?: string } };
    if (body.error) {
      // A revert on eth_call arrives as an error. Same meaning as an empty result: wrong feedId.
      if (/revert/.test(body.error.message ?? "")) return "0x";
      throw new AtlasError(`rpc error: ${body.error.message ?? "unknown"}`);
    }
    return body.result ?? "0x";
  };
}

function decodeWords(hex: string): bigint[] {
  if (!/^0x[0-9a-fA-F]*$/.test(hex)) throw new AtlasError(`not hex-encoded: ${hex.slice(0, 20)}`);
  const body = hex.slice(2);
  const out: bigint[] = [];
  for (let i = 0; i + 64 <= body.length; i += 64) out.push(BigInt(`0x${body.slice(i, i + 64)}`));
  return out;
}

function requireAddress(v: string): `0x${string}` {
  if (!/^0x[0-9a-fA-F]{40}$/.test(v)) throw new AtlasError(`feedAddress must be a 20-byte address, got "${v}"`);
  return v as `0x${string}`;
}

function requireFeedId(v: string): `0x${string}` {
  const normalised = v.startsWith("0x") ? v : `0x${v}`;
  if (!/^0x[0-9a-fA-F]{8}$/.test(normalised)) {
    throw new AtlasError(`feedId must be exactly 4 bytes (8 hex chars), got "${v}"`);
  }
  return normalised as `0x${string}`;
}
