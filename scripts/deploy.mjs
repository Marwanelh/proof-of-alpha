#!/usr/bin/env node
/**
 * Deploy CallRegistry, with no Foundry.
 *
 * Foundry is not installed on this host, so `forge create` is unavailable. This does the same job with the
 * tools that are here: solc (as a library) produces the bytecode, viem signs and sends it. It is the only
 * path to a receipt that is actually on chain, which is the difference between the demo and the money shot.
 *
 * Two modes, and the difference is a trust boundary, not a preference:
 *
 *   --referenced  (default, BSC TESTNET)  constructor(address(0), 0x00000000)
 *       The contract cannot read mainnet Atlas from testnet, so prices arrive pre-scaled from the backend
 *       and every receipt is written with atlasVerified = false. The receipt says so on its face.
 *
 *   --verified    (BSC MAINNET)           constructor(MAINNET_MULTIFEED, ATLAS_FEED_ID)
 *       The contract reads the feed itself, in the transaction. Costs real BNB; earns the mainnet bonus.
 *
 * The private key is read from the environment and never printed, echoed, passed as an argument or logged.
 * Run with --check to compile, print the deployer address and its balance, and stop before sending.
 */

import { readFileSync, existsSync, appendFileSync } from "node:fs";

import solc from "solc";
import { createPublicClient, createWalletClient, http, formatEther, getContractAddress, encodeDeployData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bsc, bscTestnet } from "viem/chains";

const SOURCE = "contracts/src/CallRegistry.sol";
const ZERO = "0x0000000000000000000000000000000000000000";
const NO_FEED = "0x00000000";
const MAINNET_MULTIFEED = "0xeace519ebb14fb8404fa6ddd23c3b34abade44aa";

const args = process.argv.slice(2);
const verified = args.includes("--verified");
const checkOnly = args.includes("--check");

function compile() {
  const content = readFileSync(SOURCE, "utf8");
  const input = {
    language: "Solidity",
    sources: { [SOURCE]: { content } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
    },
  };
  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (out.errors ?? []).filter((e) => e.severity === "error");
  if (errors.length > 0) {
    for (const e of errors) console.error(e.formattedMessage);
    throw new Error(`${errors.length} solc error(s); refusing to deploy code that does not compile`);
  }
  const contract = out.contracts?.[SOURCE]?.CallRegistry;
  if (!contract?.evm?.bytecode?.object) throw new Error(`no bytecode produced for CallRegistry in ${SOURCE}`);
  return { abi: contract.abi, bytecode: `0x${contract.evm.bytecode.object}` };
}

async function main() {
  const { abi, bytecode } = compile();
  console.log(`compiled ${SOURCE}: bytecode ${(bytecode.length - 2) / 2} bytes`);

  const rawKey = process.env["DEPLOYER_PRIVATE_KEY"];
  if (!rawKey || !/^0x[0-9a-fA-F]{64}$/.test(rawKey)) {
    console.error("DEPLOYER_PRIVATE_KEY is missing or malformed in .env.local.");
    console.error("Never paste a key into a chat or a commit. Put it in .env.local, which is gitignored.");
    process.exit(1);
  }

  const account = privateKeyToAccount(rawKey);
  const chain = verified ? bsc : bscTestnet;
  const rpcUrl = (verified ? process.env["BSC_MAINNET_RPC"] : process.env["BSC_TESTNET_RPC"]) ?? undefined;
  const transport = http(rpcUrl);
  const publicClient = createPublicClient({ chain, transport });
  const wallet = createWalletClient({ account, chain, transport });

  const constructorArgs = verified ? [MAINNET_MULTIFEED, process.env["ATLAS_FEED_ID"] ?? NO_FEED] : [ZERO, NO_FEED];

  console.log(`mode           : ${verified ? "VERIFIED (contract reads the feed)" : "REFERENCED (backend supplies the price)"}`);
  console.log(`chain          : ${chain.name} (${chain.id})`);
  console.log(`deployer       : ${account.address}`);
  console.log(`constructor    : (${constructorArgs.join(", ")})`);

  const chainId = await publicClient.getChainId();
  if (chainId !== chain.id) {
    console.error(`the RPC answered chain ${chainId} but this mode deploys to ${chain.id}; refusing.`);
    process.exit(1);
  }

  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`balance        : ${formatEther(balance)} ${chain.nativeCurrency.symbol}`);

  // A deploy costs roughly 1.5M gas plus constructor work. Anything close to zero cannot pay for it.
  const gasPrice = await publicClient.getGasPrice();
  const nonce = await publicClient.getTransactionCount({ address: account.address });
  console.log(`gas price      : ${gasPrice} wei`);
  console.log(`next nonce     : ${nonce}`);

  if (checkOnly) {
    // Dry-run the deployment itself. Compiling proves the source is valid; estimating gas against the real
    // chain proves the transaction is well-formed and that the constructor arguments satisfy the EVM. It
    // costs nothing and catches a bad constructor before the user funds a key.
    try {
      const data = encodeDeployData({ abi, bytecode, args: constructorArgs });
      const gas = await publicClient.estimateGas({ account: account.address, data });
      const cost = gas * gasPrice;
      console.log(`deploy gas     : ${gas} (about ${formatEther(cost)} ${chain.nativeCurrency.symbol} at the current price)`);
      console.log("\nthe deployment is well-formed; the chain accepted the estimate.");
    } catch (e) {
      console.error(`\nthe chain rejected the deployment dry-run: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    }
    console.log("--check: stopping before sending. Nothing was deployed and no gas was spent.");
    return;
  }

  if (balance === 0n) {
    console.error("\nThe deployer has no gas on this chain. Fund it from a BNB testnet faucet, then re-run.");
    console.error("The contract compiles and the RPC is reachable; the only thing missing is testnet BNB.");
    process.exit(1);
  }

  console.log("\nsending deployment…");
  const hash = await wallet.deployContract({
    abi,
    bytecode,
    args: constructorArgs,
    chain,
    account,
  });
  console.log(`tx             : ${hash}`);
  console.log(`predicted addr : ${getContractAddress({ from: account.address, nonce: BigInt(nonce) })}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success" || !receipt.contractAddress) {
    console.error("the deployment transaction did not succeed; no address to report.");
    process.exit(1);
  }

  console.log(`\ndeployed       : ${receipt.contractAddress}`);
  console.log(`block          : ${receipt.blockNumber}`);

  // Read it back. A returned hash is not proof the contract exists; a call is.
  const live = await publicClient.readContract({
    address: receipt.contractAddress,
    abi,
    functionName: "callCount",
  });
  console.log(`callCount()    : ${live}  (the contract is live and readable)`);

  const key = verified && chain.id === 56 ? "CALL_REGISTRY_MAINNET" : "CALL_REGISTRY_TESTNET";
  console.log(`\nadd to .env.local:\n${key}=${receipt.contractAddress}`);
  if (existsSync(".env.local") && !readFileSync(".env.local", "utf8").includes(`${key}=`)) {
    appendFileSync(".env.local", `\n${key}=${receipt.contractAddress}\n`);
    console.log(`(appended ${key} to .env.local)`);
  }
  console.log("\nTo make /api/verify write real receipts, also set ENABLE_ONCHAIN_RECORD=true in .env.local.");
}

main().catch((e) => {
  console.error(`deploy failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
