import type { Address } from "viem";
import { appConfig } from "./config";

// Client helpers that call the server-side /api/etherscan proxy (which holds the API key).
// Useful in production for reliable event history and contract metadata without hammering the RPC.

export async function etherscan<T = unknown>(params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams({ chainid: String(appConfig.chainId), ...params });
  const res = await fetch(`/api/etherscan?${qs.toString()}`);
  return (await res.json()) as T;
}

export type EtherscanLog = {
  address: Address;
  topics: `0x${string}`[];
  data: `0x${string}`;
  blockNumber: `0x${string}`;
  transactionHash: `0x${string}`;
  logIndex: `0x${string}`;
};

/**
 * Fetch raw event logs for the bid contract via Etherscan (paginated 1000/page). A production-grade
 * alternative to browser `eth_getLogs` for building bid history. Decode with viem `decodeEventLog`.
 */
export async function etherscanLogs(fromBlock: bigint, topic0?: `0x${string}`): Promise<EtherscanLog[]> {
  const out: EtherscanLog[] = [];
  let page = 1;
  for (;;) {
    const params: Record<string, string> = {
      module: "logs",
      action: "getLogs",
      address: appConfig.bids,
      fromBlock: fromBlock.toString(),
      toBlock: "latest",
      page: String(page),
      offset: "1000",
    };
    if (topic0) params.topic0 = topic0;
    const res = await etherscan<{ status: string; result: EtherscanLog[] | string }>(params);
    if (res.status !== "1" || !Array.isArray(res.result)) break;
    out.push(...res.result);
    if (res.result.length < 1000) break;
    page += 1;
  }
  return out;
}

/** Whether the bid contract's source is verified on Etherscan (production/mainnet only). */
export async function isContractVerified(): Promise<boolean> {
  const res = await etherscan<{ status: string; result: { ABI?: string }[] | string }>({
    module: "contract",
    action: "getsourcecode",
    address: appConfig.bids,
  });
  if (res.status !== "1" || !Array.isArray(res.result)) return false;
  const abi = res.result[0]?.ABI;
  return !!abi && abi !== "Contract source code not verified";
}
