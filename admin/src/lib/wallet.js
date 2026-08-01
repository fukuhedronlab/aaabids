/**
 * Wallet — injected EIP-1193 (MetaMask/Rabby, incl. a Ledger/Trezor through them). This console
 * NEVER sees, stores, or transmits a private key; the wallet signs, we only build transactions.
 * A "local" signer mode exists ONLY for the Anvil fork (uses the public test key) so you can test
 * deploy/admin without MetaMask — it is inert on any real network.
 */
import { set, get } from "./store.js";
import * as cfg from "../config.js";

export const hasWallet = () => typeof window !== "undefined" && !!window.ethereum;

export async function connect() {
  if (cfg.get().signer === "local" && cfg.isLocal()) {
    const { privateKeyToAccount } = await import("viem/accounts");
    const acct = privateKeyToAccount(cfg.LOCAL_DEV_KEY);
    set({ account: acct.address.toLowerCase(), chainId: cfg.get().chainId });
    return get().account;
  }
  if (!hasWallet()) throw new Error("No browser wallet found. Install MetaMask, or use the Local signer on Anvil.");
  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  const chainId = parseInt(await window.ethereum.request({ method: "eth_chainId" }), 16);
  set({ account: accounts[0]?.toLowerCase() || null, chainId });
  wire();
  return get().account;
}
export const disconnect = () => set({ account: null });

let wired = false;
function wire() {
  if (wired || !hasWallet()) return;
  wired = true;
  window.ethereum.on?.("accountsChanged", (a) => set({ account: a[0]?.toLowerCase() || null }));
  window.ethereum.on?.("chainChanged", (c) => set({ chainId: parseInt(c, 16) }));
}

export const onRightChain = () => cfg.get().signer === "local" || get().chainId === cfg.get().chainId;

export async function switchChain() {
  const hex = "0x" + cfg.get().chainId.toString(16);
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
  } catch (e) {
    if (e?.code === 4902) throw new Error(`Add ${cfg.chainMeta().name} to your wallet first.`);
    throw new Error("Could not switch network in your wallet.");
  }
}

export async function tryEager() {
  if (cfg.get().signer === "local" && cfg.isLocal()) return connect().catch(() => {});
  if (!hasWallet()) return;
  try {
    const accounts = await window.ethereum.request({ method: "eth_accounts" });
    if (accounts?.length) {
      const chainId = parseInt(await window.ethereum.request({ method: "eth_chainId" }), 16);
      set({ account: accounts[0].toLowerCase(), chainId });
      wire();
    }
  } catch {}
}
