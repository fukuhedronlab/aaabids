import { createConnector } from "wagmi";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  http,
  numberToHex,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { appConfig } from "./config";
import { batcherAbi } from "./abis";

/**
 * Local-only "demo" wallet for the Anvil fork. Unlike a plain forwarder, it signs with the well-known
 * Anvil private keys (public test keys — local only) so it can implement EIP-5792 `wallet_sendCalls`
 * via a REAL EIP-7702 atomic batch: the account delegates to the Batcher and executes
 * [listForSale, acceptOffer] in a single transaction. This lets the exact production code path
 * (wagmi `useSendCalls`) run end-to-end against the fork. Never enabled in production.
 */

// Anvil's deterministic dev-account keys (NOT secrets — universal test keys).
const ANVIL_KEYS: Record<string, Hex> = {
  "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266":
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x70997970c51812dc3a010c7d01b50e0d17dc79c8":
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
};

const chain = defineChain({
  id: appConfig.chainId,
  name: appConfig.chainName,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [appConfig.rpcUrl] } },
});
const publicClient = createPublicClient({ chain, transport: http(appConfig.rpcUrl) });

function accountFor(addr: Address) {
  const key = ANVIL_KEYS[addr.toLowerCase()];
  if (!key) throw new Error(`no demo key for ${addr}`);
  return privateKeyToAccount(key);
}
function walletFor(addr: Address) {
  return createWalletClient({ account: accountFor(addr), chain, transport: http(appConfig.rpcUrl) });
}

type Listener = (...args: unknown[]) => void;
let selectedIndex = 0;
const providerListeners = new Set<{ event: string; fn: Listener }>();
const emit = (event: string, ...args: unknown[]) => {
  for (const l of providerListeners) if (l.event === event) l.fn(...args);
};

export function switchDemoAccount(index: number) {
  selectedIndex = index;
  const addr = appConfig.demoAccounts[index]?.address;
  if (addr) emit("accountsChanged", [addr]);
}
export function currentDemoIndex() {
  return selectedIndex;
}

// Cache of raw receipts by calls-id, for wallet_getCallsStatus.
const callsReceipts = new Map<string, Record<string, unknown>>();

async function rpc(method: string, params: unknown[]) {
  const res = await fetch(appConfig.rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? "RPC error");
  return json.result;
}

const chainIdHex = numberToHex(appConfig.chainId);

const provider = {
  async request({ method, params = [] }: { method: string; params?: unknown[] }) {
    const addr = appConfig.demoAccounts[selectedIndex]?.address as Address | undefined;

    switch (method) {
      case "eth_requestAccounts":
      case "eth_accounts":
        return addr ? [addr] : [];
      case "eth_chainId":
        return chainIdHex;
      case "wallet_switchEthereumChain":
      case "wallet_addEthereumChain":
        return null;

      // --- EIP-5792 ---
      case "wallet_getCapabilities": {
        // Advertise atomic batching on the active chain.
        return { [chainIdHex]: { atomic: { status: "supported" }, atomicBatch: { supported: true } } };
      }
      case "wallet_sendCalls": {
        if (!addr) throw new Error("not connected");
        const req = (params[0] ?? {}) as {
          calls?: { to?: Address; data?: Hex; value?: Hex }[];
        };
        const calls = (req.calls ?? []).map((c) => ({
          to: (c.to ?? "0x0000000000000000000000000000000000000000") as Address,
          value: c.value ? BigInt(c.value) : 0n,
          data: (c.data ?? "0x") as Hex,
        }));
        const account = accountFor(addr);
        const wallet = walletFor(addr);
        // Delegate this EOA to the Batcher and call execute() on itself, atomically.
        const authorization = await wallet.signAuthorization({
          account,
          contractAddress: appConfig.batcher,
          executor: "self",
        });
        const hash = await wallet.sendTransaction({
          to: account.address,
          data: encodeFunctionData({ abi: batcherAbi, functionName: "execute", args: [calls] }),
          authorizationList: [authorization],
        });
        const raw = (await rpc("eth_getTransactionReceipt", [hash])) as Record<string, unknown>;
        callsReceipts.set(hash, raw);
        return { id: hash };
      }
      case "wallet_getCallsStatus": {
        const id = params[0] as string;
        const raw = callsReceipts.get(id);
        if (!raw) return { version: "2.0.0", id, chainId: chainIdHex, status: 100, receipts: [] };
        const ok = raw.status === "0x1";
        return {
          version: "2.0.0",
          id,
          chainId: chainIdHex,
          atomic: true,
          status: ok ? 200 : 500,
          receipts: [
            {
              transactionHash: raw.transactionHash,
              blockHash: raw.blockHash,
              blockNumber: raw.blockNumber,
              gasUsed: raw.gasUsed,
              status: raw.status,
              logs: raw.logs ?? [],
            },
          ],
        };
      }

      // --- signing / sending ---
      case "eth_sendTransaction": {
        if (!addr) throw new Error("not connected");
        const tx = (params[0] ?? {}) as { to?: Address; data?: Hex; value?: Hex; gas?: Hex };
        return walletFor(addr).sendTransaction({
          to: tx.to,
          data: tx.data,
          value: tx.value ? BigInt(tx.value) : undefined,
        });
      }
      case "personal_sign": {
        if (!addr) throw new Error("not connected");
        return walletFor(addr).signMessage({ message: { raw: params[0] as Hex } });
      }

      default:
        return rpc(method, params);
    }
  },
  on(event: string, fn: Listener) {
    providerListeners.add({ event, fn });
  },
  removeListener(event: string, fn: Listener) {
    for (const l of providerListeners) if (l.event === event && l.fn === fn) providerListeners.delete(l);
  },
};

export function demoConnector() {
  return createConnector((config) => ({
    id: "demo",
    name: "Demo Wallet (local fork)",
    type: "demo",
    async setup() {
      provider.on("accountsChanged", (accounts) => {
        config.emitter.emit("change", { accounts: accounts as readonly Address[] });
      });
    },
    // wagmi's connect() return is generic over EIP-5792 `withCapabilities`; this demo-only connector
    // always returns plain accounts, so the return is widened to satisfy the generic signature.
    async connect() {
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as Address[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { accounts, chainId: appConfig.chainId } as any;
    },
    async disconnect() {},
    async getAccounts() {
      return (await provider.request({ method: "eth_accounts" })) as readonly Address[];
    },
    async getChainId() {
      return appConfig.chainId;
    },
    async getProvider() {
      return provider;
    },
    async isAuthorized() {
      return false;
    },
    onAccountsChanged(accounts) {
      config.emitter.emit("change", { accounts: accounts as readonly Address[] });
    },
    onChainChanged() {},
    onDisconnect() {
      config.emitter.emit("disconnect");
    },
  }));
}
