/**
 * Receipt writer — turns a completed verification into a `recordCallReferenced` transaction.
 *
 * Referenced mode, because a BSC testnet contract cannot read a mainnet Atlas feed, so the price is
 * supplied by the backend and the receipt says so: `atlasVerified` is false. It is not a parameter here
 * on purpose — this module has no way to claim a verified read.
 *
 * The encode path is pure and tested; only `writeReceipt` touches the network. Everything the contract
 * cannot check (a symbol that will not fit in bytes4, a price that will not fit in uint128, a probability
 * outside basis points) is validated here, before a transaction is built, because a revert costs gas and
 * a truncation costs truth.
 *
 * NOTE: add `import "server-only"` here once the Next app lands.
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  keccak256,
  stringToHex,
  toHex,
  decodeEventLog,
  type Abi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bsc, bscTestnet } from "viem/chains";

import type { AtlasSnapshot, Claim, CmcSnapshot, CournotResponse, OnChainReceipt } from "../shared/types.ts";

export class RegistryError extends Error {}

/** Mirrors contracts/src/CallRegistry.sol exactly. If the contract changes, this must change with it. */
export const CALL_REGISTRY_ABI = [
  {
    type: "function",
    name: "recordCallReferenced",
    stateMutability: "nonpayable",
    inputs: [
      { name: "postHash", type: "bytes32" },
      { name: "kolId", type: "bytes32" },
      { name: "asset", type: "bytes4" },
      { name: "direction", type: "int8" },
      { name: "target", type: "uint128" },
      { name: "deadline", type: "uint64" },
      { name: "cournotBps", type: "uint16" },
      { name: "cmcPrice", type: "uint128" },
      { name: "atlasPrice", type: "uint128" },
      { name: "atlasOnchainTs", type: "uint48" },
      { name: "atlasRefBlock", type: "uint64" },
    ],
    outputs: [{ name: "id", type: "uint256" }],
  },
  {
    type: "function",
    name: "callCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "event",
    name: "CallRecorded",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "kolId", type: "bytes32", indexed: true },
      { name: "postHash", type: "bytes32", indexed: false },
      { name: "asset", type: "bytes4", indexed: false },
      { name: "direction", type: "int8", indexed: false },
      { name: "deadline", type: "uint64", indexed: false },
      { name: "cournotBps", type: "uint16", indexed: false },
      { name: "cmcPrice", type: "uint128", indexed: false },
      { name: "atlasPrice", type: "uint128", indexed: false },
      { name: "atlasOnchainTs", type: "uint48", indexed: false },
      { name: "atlasVerified", type: "bool", indexed: false },
    ],
  },
  // Custom errors, so a revert decodes to a name instead of raw bytes.
  { type: "error", name: "FeedNeverUpdated", inputs: [] },
  { type: "error", name: "StaleAtlasPrice", inputs: [{ name: "onchainTs", type: "uint256" }] },
  { type: "error", name: "FeedNotOpenRead", inputs: [] },
  { type: "error", name: "FeedNotConfigured", inputs: [] },
  { type: "error", name: "FeedAlreadyConfigured", inputs: [] },
  { type: "error", name: "NotYetDue", inputs: [{ name: "deadline", type: "uint64" }] },
  { type: "error", name: "AlreadyResolved", inputs: [] },
  { type: "error", name: "UnknownCall", inputs: [{ name: "id", type: "uint256" }] },
] as const satisfies Abi;

export type EncodableCall = {
  claim: Claim;
  cournot: CournotResponse;
  cmc: CmcSnapshot;
  atlas: AtlasSnapshot;
};

/* --------------------------------------------------------------- pure encoding */

/** Exact decimal-string to fixed-point integer. No float multiplication anywhere. */
export function scaleDecimal(value: string, decimals: number): bigint {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new RegistryError(`not a plain positive decimal: "${value}"`);
  }
  const [intPart = "0", fracPart = ""] = trimmed.split(".");
  if (fracPart.length > decimals) {
    // Truncate rather than round: rounding up a price target would move a call's own goalpost.
    // shortcut: prices beyond the feed's precision are truncated, revisit if a feed ever needs more.
  }
  const frac = (fracPart + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(intPart) * 10n ** BigInt(decimals) + BigInt(frac === "" ? "0" : frac);
}

export function symbolToBytes4(symbol: string): `0x${string}` {
  const upper = symbol.trim().toUpperCase();
  const bytes = new TextEncoder().encode(upper);
  if (bytes.length === 0) throw new RegistryError("asset symbol is empty");
  if (bytes.length > 4) {
    throw new RegistryError(`asset "${upper}" is ${bytes.length} bytes; the contract stores 4. Use a shorter ticker.`);
  }
  const out = new Uint8Array(4);
  out.set(bytes);
  return toHex(out);
}

export function probabilityToBps(probability: number): number {
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
    throw new RegistryError(`probability must be in [0, 1], got ${String(probability)}`);
  }
  return Math.round(probability * 10_000);
}

function requireUint(value: bigint, max: bigint, what: string): bigint {
  if (value < 0n) throw new RegistryError(`${what} is negative`);
  if (value > max) throw new RegistryError(`${what} exceeds its Solidity width (${value} > ${max})`);
  return value;
}

export type EncodedCall = {
  args: readonly [bigint, bigint, `0x${string}`, number, bigint, bigint, bigint, bigint, bigint, number, bigint];
  postHash: `0x${string}`;
  kolId: `0x${string}`;
};

/**
 * Validate and assemble the call arguments. Every check here is one the contract cannot make for us,
 * and each of them would otherwise cost a revert or a silent truncation.
 */
export function encodeCall(call: EncodableCall): EncodedCall {
  const { claim, cournot, cmc, atlas } = call;

  if (claim.direction !== "bullish" && claim.direction !== "bearish") {
    throw new RegistryError(`direction must be bullish or bearish, got "${String(claim.direction)}"`);
  }

  const parsedDeadline = new Date(claim.deadline);
  // Parse before converting: BigInt(NaN) throws a RangeError, which would leak a library error
  // instead of a domain one and tell the caller nothing useful.
  if (Number.isNaN(parsedDeadline.getTime())) {
    throw new RegistryError(`unparseable deadline: ${claim.deadline}`);
  }
  const deadline = BigInt(Math.floor(parsedDeadline.getTime() / 1000));
  if (deadline <= 0n) throw new RegistryError(`deadline is not a positive epoch: ${claim.deadline}`);
  requireUint(deadline, 18_446_744_073_709_551_615n, "deadline");

  const decimals = atlas.decimals;
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 77) {
    throw new RegistryError(`implausible atlas decimals: ${String(decimals)}`);
  }

  const target = requireUint(scaleDecimal(claim.targetUsd, decimals), (1n << 128n) - 1n, "target");
  const cmcPrice = requireUint(scaleDecimal(cmc.priceUsd, decimals), (1n << 128n) - 1n, "cmcPrice");
  const atlasPrice = requireUint(BigInt(atlas.price), (1n << 128n) - 1n, "atlasPrice");

  const cournotBps = probabilityToBps(cournot.probability);
  if (cournotBps > 65_535) throw new RegistryError("cournotBps does not fit uint16");

  const atlasOnchainTs = requireUint(BigInt(atlas.onchainTs), (1n << 48n) - 1n, "atlasOnchainTs");
  const atlasRefBlock = requireUint(BigInt(atlas.mainnetBlock), (1n << 64n) - 1n, "atlasRefBlock");

  if (atlasPrice === 0n || atlasOnchainTs === 0n || atlasRefBlock === 0n) {
    // The block is as load-bearing as the price: it is what lets anyone re-check the stored value
    // against Atlas's mainnet history. A zero block makes the receipt unverifiable.
    throw new RegistryError("Atlas price, timestamp and reference block must all be non-zero");
  }

  const postHash = keccak256(stringToHex(claim.originalText));
  const kolId = keccak256(stringToHex(claim.authorId));

  return {
    args: [
      BigInt(postHash),
      BigInt(kolId),
      symbolToBytes4(claim.asset),
      claim.direction === "bullish" ? 1 : -1,
      target,
      deadline,
      BigInt(cournotBps),
      cmcPrice,
      atlasPrice,
      Number(atlasOnchainTs),
      atlasRefBlock,
    ] as const,
    postHash,
    kolId,
  };
}

/* ----------------------------------------------------------------- the write */

export type WriterConfig = {
  registry: `0x${string}`;
  rpcUrl: string;
  /** Read from the environment only. Never a parameter the caller passes from anywhere else. */
  privateKey?: `0x${string}`;
  chainId?: 56 | 97;
};

export function writerConfigFromEnv(): WriterConfig {
  const registry = process.env["CALL_REGISTRY_TESTNET"];
  const privateKey = process.env["DEPLOYER_PRIVATE_KEY"];
  if (!registry || !/^0x[0-9a-fA-F]{40}$/.test(registry)) {
    throw new RegistryError("CALL_REGISTRY_TESTNET is not a deployed address — deploy first (Phase 2)");
  }
  if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new RegistryError("DEPLOYER_PRIVATE_KEY is missing or malformed in .env.local");
  }
  return {
    registry: registry as `0x${string}`,
    rpcUrl: process.env["BSC_TESTNET_RPC"] ?? "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
    privateKey: privateKey as `0x${string}`,
    chainId: 97,
  };
}

/** Injected so the pipeline test never signs or sends anything. */
export type SendTransaction = (request: {
  address: `0x${string}`;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
}) => Promise<`0x${string}`>;

export type WaitForReceipt = (hash: `0x${string}`) => Promise<{ status: "success" | "reverted"; logs: readonly unknown[] }>;

export type WriteDeps = {
  send: SendTransaction;
  wait: WaitForReceipt;
  /** Where to write. Passed in rather than read from the environment inside, so a test cannot be fooled
   *  into believing it exercised a real registry. */
  registry: `0x${string}`;
  chainId: 56 | 97;
};

/**
 * Send the receipt. Never holds funds, never chooses the probability, and cannot mark a referenced Atlas
 * read as verified — `atlasVerified` is hard-coded false here and there is no parameter to change it.
 */
export async function writeReceipt(call: EncodableCall, deps: WriteDeps): Promise<OnChainReceipt> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(deps.registry)) {
    throw new RegistryError(`registry address is not a deployed address: "${deps.registry}"`);
  }
  const encoded = encodeCall(call);
  const hash = await deps.send({
    address: deps.registry,
    abi: CALL_REGISTRY_ABI as unknown as Abi,
    functionName: "recordCallReferenced",
    args: encoded.args,
  });

  const receipt = await deps.wait(hash);
  if (receipt.status !== "success") {
    throw new RegistryError(`transaction ${hash} reverted; refusing to report a receipt that does not exist`);
  }

  return {
    chainId: deps.chainId,
    registry: deps.registry,
    txHash: hash,
    callId: findCallId(receipt.logs, encoded.postHash).toString(),
    atlasVerified: false, // referenced mode: this module cannot claim otherwise
  };
}

function findCallId(logs: readonly unknown[], postHash: `0x${string}`): bigint {
  for (const log of logs) {
    if (typeof log !== "object" || log === null) continue;
    const l = log as { topics?: readonly `0x${string}`[]; data?: `0x${string}` };
    try {
      const decoded = decodeEventLog({
        abi: CALL_REGISTRY_ABI as unknown as Abi,
        data: l.data ?? "0x",
        topics: (l.topics ?? []) as [`0x${string}`, ...`0x${string}`[]],
      });
      if (decoded.eventName !== "CallRecorded") continue;
      const args = decoded.args as unknown as { id: bigint; postHash: `0x${string}` };
      if (args.postHash.toLowerCase() !== postHash.toLowerCase()) continue;
      return args.id;
    } catch {
      continue; // not one of our events
    }
  }
  throw new RegistryError("the transaction succeeded but emitted no matching CallRecorded event; refusing to invent a call id");
}

/** Real transport. Used only when the caller asks for it, never in tests. */
export function liveTransport(config: WriterConfig): { send: SendTransaction; wait: WaitForReceipt } {
  if (!config.privateKey) throw new RegistryError("a private key is required to send");
  const account = privateKeyToAccount(config.privateKey);
  const chain = config.chainId === 56 ? bsc : bscTestnet;
  const wallet = createWalletClient({ account, chain, transport: http(config.rpcUrl) });
  const publicClient = createPublicClient({ chain, transport: http(config.rpcUrl) });

  return {
    send: async (request) =>
      wallet.writeContract({
        address: request.address,
        abi: request.abi,
        functionName: request.functionName,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- viem types the args per-ABI
        args: request.args as any,
        chain,
        account,
      }),
    wait: async (hash) => {
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return { status: receipt.status, logs: receipt.logs };
    },
  };
}
