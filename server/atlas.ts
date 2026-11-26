/**
 * Atlas gateway — a mainnet price read over a keyless public RPC.
 *
 * Atlas publishes **two contract shapes**, and they are read differently. Both are live on BSC mainnet:
 *
 *  - **MultiFeed** — one contract serving many feeds, addressed by a 4-byte id: `fetch(bytes4)`. The
 *    catalogue number IS the id (#1164 → `0x0000048c`, verified live).
 *  - **SingleFeed** — one contract per pair per network, Chainlink-compatible: `latestRoundData()`, with
 *    `description()` naming what it prices. **BNB/USD on BSC mainnet is one of these**, and it is the
 *    reason this file has two paths instead of one.
 *
 * The receipt must be able to say *which* shape it read and *what* the feed says it prices, because the
 * two are not interchangeable. A read from a feed that prices something else is not a BNB price, and
 * presenting it as one is exactly the claim this project refuses to make — the honest fix was to go find
 * the feed that really prices BNB, not to label a different one more carefully. So the shape (`kind`) and
 * the contract's own `description()` are carried on the snapshot, and the UI prints them.
 *
 * Two defects lived here and both are fixed, each verified against the live contract:
 *
 *  1. **Calldata padding.** A `bytes4` argument is ABI-encoded as a RIGHT-PADDED 32-byte word. Sending the
 *     four bare bytes after the selector reverts with an empty reason — which I had misread as "wrong
 *     feedId", then documented as fact. Verified live: unpadded reverts, padded returns a price.
 *  2. **The reference block was not the block the price came from.** `eth_call` at `latest` followed by a
 *     separate `eth_blockNumber` can straddle a block. Every read is now pinned to one block, and that
 *     block is what the receipt records — otherwise "check the price at this block" is a false claim.
 *
 * Keyless and free: no account, no key, no signup. This alone satisfies "read an on-chain feed".
 *
 * NOTE: add `import "server-only"` once the Next app lands. It cannot be added earlier: the package throws
 * outside a React Server Component context, which would break the CLI and the test suite.
 */

import type { AtlasSnapshot } from "../shared/types.ts";

/** keccak256 of the signature, four bytes, each computed and verified against the live contracts. */
const SEL_FETCH = "0x7ffc4b97"; // fetch(bytes4)
const SEL_DECIMALS = "0x313ce567"; // decimals()
const SEL_LATEST_ROUND_DATA = "0xfeaf968c"; // latestRoundData()
const SEL_DESCRIPTION = "0x7284e416"; // description()
const DEFAULT_RPC = "https://bsc-dataseed.binance.org";

export class AtlasError extends Error {}

export type AtlasConfig = {
  feedAddress: string;
  /**
   * The MultiFeed's 4-byte feed id. **Present** means read the MultiFeed through `fetch`. **Absent** means
   * read the SingleFeed at `feedAddress` through `latestRoundData`. The choice is made by which value is
   * configured and is recorded on the snapshot, never inferred silently.
   */
  feedId?: string;
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

/**
 * One Atlas read, pinned to one block. With a configured `feedId` this reads the MultiFeed through
 * `fetch`; without one it reads the Chainlink-compatible SingleFeed at `feedAddress`.
 */
export async function readAtlas(
  config: AtlasConfig,
  transport: AtlasTransport = httpTransport(config.rpcUrl),
): Promise<AtlasSnapshot> {
  const feedAddress = requireAddress(config.feedAddress);

  // One block, then every read pinned to it.
  const block = await transport.blockNumber();
  const blockTag = `0x${block.toString(16)}`;
  const description = await readDescription(transport, feedAddress, blockTag);

  return config.feedId === undefined || config.feedId === ""
    ? readSingleFeed(transport, feedAddress, block, blockTag, description)
    : readMultiFeed(transport, feedAddress, requireFeedId(config.feedId), block, blockTag, description);
}

async function readMultiFeed(
  transport: AtlasTransport,
  feedAddress: `0x${string}`,
  feedId: `0x${string}`,
  block: bigint,
  blockTag: string,
  description: string,
): Promise<AtlasSnapshot> {
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

  return {
    feedAddress,
    kind: "multifeed",
    feedId,
    description,
    price: price.toString(),
    decimals: await readDecimals(transport, feedAddress, blockTag),
    aggregatedTs,
    onchainTs,
    mainnetBlock: block.toString(),
  };
}

async function readSingleFeed(
  transport: AtlasTransport,
  feedAddress: `0x${string}`,
  block: bigint,
  blockTag: string,
  description: string,
): Promise<AtlasSnapshot> {
  const roundWord = await transport.call(feedAddress, SEL_LATEST_ROUND_DATA, blockTag);
  if (!roundWord || roundWord === "0x") {
    throw new AtlasError(
      `latestRoundData() reverted on ${feedAddress} at block ${block}: this is not a Chainlink-compatible ` +
        "SingleFeed. Configure a feedId to read a MultiFeed instead.",
    );
  }

  const words = decodeWords(roundWord);
  if (words.length < 5) {
    throw new AtlasError(`unexpected latestRoundData length from ${feedAddress}: ${roundWord.slice(0, 20)}…`);
  }

  const answer = words[1]!; // int256 in the ABI; a price must be positive
  const updatedAt = Number(words[3]!);
  if (answer <= 0n) {
    throw new AtlasError(`${feedAddress} last answered a non-positive price (${answer.toString()}); refusing to use it`);
  }
  if (updatedAt === 0) {
    throw new AtlasError(`${description} at ${feedAddress} has never been updated (zero timestamp)`);
  }

  return {
    feedAddress,
    kind: "singlefeed",
    description,
    price: answer.toString(),
    decimals: await readDecimals(transport, feedAddress, blockTag),
    aggregatedTs: updatedAt,
    // A SingleFeed has no separate on-chain timestamp; its answer is written on chain, so this is it.
    onchainTs: updatedAt,
    mainnetBlock: block.toString(),
  };
}

/** `description()` as the contract itself writes it, so the receipt can name the pair it read. */
async function readDescription(transport: AtlasTransport, feedAddress: `0x${string}`, blockTag: string): Promise<string> {
  const word = await transport.call(feedAddress, SEL_DESCRIPTION, blockTag);
  const text = decodeAbiString(word).trim();
  return text === "" ? "(no description)" : text;
}

async function readDecimals(transport: AtlasTransport, feedAddress: `0x${string}`, blockTag: string): Promise<number> {
  const words = decodeWords(await transport.call(feedAddress, SEL_DECIMALS, blockTag));
  if (words.length === 0) throw new AtlasError("decimals() returned nothing");
  const decimals = Number(words[0]!);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 77) {
    throw new AtlasError(`implausible decimals from ${feedAddress}: ${decimals}`);
  }
  return decimals;
}

function decodeWords(hex: string): bigint[] {
  if (!/^0x[0-9a-fA-F]*$/.test(hex)) throw new AtlasError(`not hex-encoded: ${hex.slice(0, 20)}`);
  const body = hex.slice(2);
  const out: bigint[] = [];
  for (let i = 0; i + 64 <= body.length; i += 64) out.push(BigInt(`0x${body.slice(i, i + 64)}`));
  return out;
}

/** ABI-encoded string: word 0 is the offset of the length word, then the bytes themselves. */
function decodeAbiString(hex: string): string {
  if (!hex || hex === "0x") return "";
  const words = decodeWords(hex);
  if (words.length < 2) return "";
  const offset = Number(words[0]!);
  const length = Number(words[1]!);
  if (!Number.isFinite(offset) || !Number.isFinite(length) || length <= 0 || length > 512) return "";
  const start = (offset + 32) * 2;
  const slice = hex.slice(2 + start, 2 + start + length * 2);
  if (slice.length < length * 2) return "";
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) bytes[i] = Number.parseInt(slice.slice(i * 2, i * 2 + 2), 16);
  return new TextDecoder().decode(bytes);
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
