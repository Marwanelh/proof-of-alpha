/**
 * Atlas gateway — one mainnet MultiFeed snapshot, read over a keyless public RPC.
 *
 * Two defects lived here and both are now fixed, each verified against the live contract:
 *
 *  1. **Calldata padding.** A `bytes4` argument is ABI-encoded as a RIGHT-PADDED 32-byte word. Sending
 *     the four bare bytes after the selector reverts with an empty reason — which I had misread as "wrong
 *     feedId", and then documented as fact. Verified live: unpadded reverts, padded returns a price.
 *     So the catalogue number IS the on-chain id (`0x0000048c` for #1164).
 *  2. **The reference block was not the block the price came from.** `eth_call` at `latest` followed by a
 *     separate `eth_blockNumber` can straddle a block. Every read is now pinned to one block, and that
 *     block is what the receipt records — otherwise "check the price at this block" is a false claim.
 *
 * Keyless and free: no account, no key, no signup. This alone satisfies "read an on-chain feed".
 *
 * NOTE: add `import "server-only"` once the Next app lands. It cannot be added earlier: the package
 * throws outside a React Server Component context, which would break the CLI and the test suite.
 */

import type { AtlasSnapshot } from "../shared/types.ts";

/** keccak256("fetch(bytes4)")[0:4] and keccak256("decimals()")[0:4], computed and verified live. */
const SEL_FETCH = "0x7ffc4b97";
const SEL_DECIMALS = "0x313ce567";
const DEFAULT_RPC = "https://bsc-dataseed.binance.org";

export class AtlasError extends Error {}

export type AtlasConfig = {
  feedAddress: string;
  feedId: string; // 4 bytes, e.g. "0x0000048c"
  rpcUrl?: string;
};

/** Everything the reader needs from the chain, injected so no test touches the network. */
export type AtlasTransport = {
  blockNumber(): Promise<bigint>;
  call(to: string, data: string, blockTag: string): Promise<string>;
};

export function httpTransport(rpcUrl?: string): AtlasTransport {
  const url = rpcUrl ?? process.env["BSC_MAINNET_RPC"] ?? DEFAULT_RPC;
  const rpc = async (method: string, params: unknown[]): Promise<string> => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const body = (await res.json()) as { result?: string; error?: { message?: string } };
    if (body.error) throw new AtlasError(`rpc ${method} failed: ${body.error.message ?? "unknown"}`);
    return body.result ?? "0x";
  };
  return {
    blockNumber: async () => BigInt(await rpc("eth_blockNumber", [])),
    call: async (to, data, blockTag) => {
      try {
        return await rpc("eth_call", [{ to, data }, blockTag]);
      } catch (e) {
        // A revert arrives as a JSON-RPC error. An empty revert is the normal signal for a bad argument.
        if (/revert/i.test(String(e))) return "0x";
        throw e;
      }
    },
  };
}

/** bytes4 -> the right-padded 32-byte word the ABI requires. */
export function encodeBytes4Arg(feedId: `0x${string}`): string {
  return feedId.slice(2).padEnd(64, "0");
}

export async function readAtlas(config: AtlasConfig, transport: AtlasTransport = httpTransport(config.rpcUrl)): Promise<AtlasSnapshot> {
  const feedAddress = requireAddress(config.feedAddress);
  const feedId = requireFeedId(config.feedId);

  // One block, then every read pinned to it.
  const block = await transport.blockNumber();
  const blockTag = `0x${block.toString(16)}`;

  const snapshotWord = await transport.call(feedAddress, SEL_FETCH + encodeBytes4Arg(feedId), blockTag);
  if (!snapshotWord || snapshotWord === "0x") {
    throw new AtlasError(
      `fetch(${feedId}) reverted on ${feedAddress} at block ${block}. A revert means the id is not a known ` +
        "feed; a known-but-never-updated feed returns zeros instead.",
    );
  }

  const words = decodeWords(snapshotWord);
  if (words.length < 3) throw new AtlasError(`unexpected snapshot length from ${feedAddress}: ${snapshotWord.slice(0, 20)}…`);

  const price = words[0]!;
  const aggregatedTs = Number(words[1]!);
  const onchainTs = Number(words[2]!);
  if (price === 0n || onchainTs === 0) {
    throw new AtlasError(`${feedId} is a known feed that has never been updated (zero snapshot)`);
  }

  const decimalsWord = await transport.call(feedAddress, SEL_DECIMALS, blockTag);
  const decimalsWords = decodeWords(decimalsWord);
  if (decimalsWords.length === 0) throw new AtlasError("decimals() returned nothing");

  return {
    feedAddress,
    feedId,
    price: price.toString(),
    decimals: Number(decimalsWords[0]!),
    aggregatedTs,
    onchainTs,
    mainnetBlock: block.toString(),
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
