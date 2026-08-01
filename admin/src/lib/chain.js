/**
 * Chain layer — viem reads, dry-run (simulate) → send, calldata encoding, and browser deploy.
 * Every write is SIMULATED first (eth_call); only a passing simulation is signed, so a doomed tx
 * never reaches your wallet. No private keys here for real networks — see wallet.js.
 */
import { createPublicClient, createWalletClient, custom, http, encodeFunctionData, formatEther } from "viem";
import * as cfg from "../config.js";
import { get } from "./store.js";

function chainObj() {
  const { chainId } = cfg.get();
  return {
    id: chainId,
    name: cfg.chainMeta().name,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [cfg.get().rpc] } },
  };
}

let _pub, _pubKey;
export function pub() {
  const key = cfg.get().chainId + "|" + cfg.get().rpc;
  if (!_pub || _pubKey !== key) {
    _pub = createPublicClient({ chain: chainObj(), transport: http(cfg.get().rpc) });
    _pubKey = key;
  }
  return _pub;
}
export const resetPub = () => {
  _pub = null;
};

async function wallet() {
  if (cfg.get().signer === "local" && cfg.isLocal()) {
    const { privateKeyToAccount } = await import("viem/accounts");
    return createWalletClient({ account: privateKeyToAccount(cfg.LOCAL_DEV_KEY), chain: chainObj(), transport: http(cfg.get().rpc) });
  }
  return createWalletClient({ chain: chainObj(), transport: custom(window.ethereum) });
}

export const read = (target, functionName, args = []) => pub().readContract({ ...target, functionName, args });
export const encodeCall = (abi, functionName, args = []) => encodeFunctionData({ abi, functionName, args });

/** Dry-run a write via eth_call; throws the decoded revert reason if it would fail. */
export async function simulate(target, functionName, args = [], value = 0n) {
  const account = get().account;
  const { request } = await pub().simulateContract({ ...target, functionName, args, value, account });
  return request;
}

/** Simulate → send → tx hash. */
export async function send(target, functionName, args = [], value = 0n) {
  const request = await simulate(target, functionName, args, value);
  return (await wallet()).writeContract(request);
}

export const waitFor = (hash) =>
  pub().waitForTransactionReceipt({ hash, timeout: 240_000, pollingInterval: 2_000 });

/** Deploy from compiled artifacts; returns { address, hash }. */
export async function deploy(abi, bytecode, args = []) {
  const account = get().account;
  const hash = await (await wallet()).deployContract({ abi, bytecode, args, account });
  const receipt = await waitFor(hash);
  if (!receipt.contractAddress) throw new Error("Deploy succeeded but no contract address in receipt");
  return { address: receipt.contractAddress, hash };
}

/** Rough gas cost estimate (ETH) for a write. */
export async function estimateCost(target, functionName, args = [], value = 0n) {
  const account = get().account;
  const gas = await pub().estimateContractGas({ ...target, functionName, args, value, account });
  const block = await pub().getBlock({ blockTag: "latest" });
  const fee = (block.baseFeePerGas ?? 0n) * gas;
  return { gas, eth: formatEther(fee) };
}
