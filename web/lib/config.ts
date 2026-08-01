import type { Address } from "viem";

/** All values are inlined at build time from NEXT_PUBLIC_* env vars. */
export const appConfig = {
  chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 31337),
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545",
  chainName: process.env.NEXT_PUBLIC_CHAIN_NAME ?? "Local Fork",
  bids: (process.env.NEXT_PUBLIC_BIDS_ADDRESS ?? "0x0000000000000000000000000000000000000000") as Address,
  genesis: (process.env.NEXT_PUBLIC_GENESIS_ADDRESS ??
    "0xa7a3022249415e25752C4cF8696c2418DEfdF2Db") as Address,
  weth: (process.env.NEXT_PUBLIC_WETH_ADDRESS ??
    "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2") as Address,
  walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "",
  /** EIP-7702 batch delegate for the demo wallet (deployed by scripts/dev-fork.sh). */
  batcher: (process.env.NEXT_PUBLIC_BATCHER ?? "0x0000000000000000000000000000000000000000") as Address,
  deployBlock: BigInt(process.env.NEXT_PUBLIC_DEPLOY_BLOCK ?? "0"),
  /** Comma-separated "Label:0xAddress" pairs enabling the local-fork demo wallet. */
  demoAccounts: parseDemoAccounts(process.env.NEXT_PUBLIC_DEMO_ACCOUNTS ?? ""),
  /** A known piece address to preselect in the UI (demo convenience). */
  demoPiece: (process.env.NEXT_PUBLIC_DEMO_PIECE ?? "") as Address | "",
  /** Optional GitHub repo link shown in the footer (set NEXT_PUBLIC_GITHUB_URL to enable). */
  githubUrl: process.env.NEXT_PUBLIC_GITHUB_URL ?? "",
  /** Optional site URL used for WalletConnect metadata (falls back to the runtime origin). */
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "",
} as const;

function parseDemoAccounts(raw: string): { label: string; address: Address }[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((pair) => {
      const [label, address] = pair.split(":");
      return { label: label ?? "Account", address: (address ?? label) as Address };
    })
    .filter((a) => a.address.startsWith("0x"));
}

export const isDemo = appConfig.demoAccounts.length > 0;

/**
 * The URL the read transport should use.
 * - Client: an absolute NEXT_PUBLIC_RPC_URL is used as-is (local fork); a relative one like
 *   `/api/rpc` resolves against the current origin (production, hitting the keyed proxy).
 * - Server (SSR): uses the real keyed upstream `RPC_URL` directly (no self-request), falling back
 *   to an absolute NEXT_PUBLIC_RPC_URL or the local fork.
 */
export function resolveRpcUrl(): string {
  const u = appConfig.rpcUrl;
  if (typeof window === "undefined") {
    return process.env.RPC_URL || (u.startsWith("http") ? u : "http://127.0.0.1:8545");
  }
  return u.startsWith("http") ? u : window.location.origin + u;
}
