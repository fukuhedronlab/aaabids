/**
 * Admin console config, persisted to localStorage (this machine only). The deployed contract
 * address is entered/saved in the UI after deploy — one console serves deploy → configure → operate.
 * Nothing here is secret; the wallet holds all keys.
 */
const KEY = "aaabids.admin.cfg";

const DEFAULTS = {
  chainId: 31337, // 1 mainnet · 11155111 sepolia · 31337 anvil — default local for safety
  rpc: "http://127.0.0.1:8545",
  bids: "", // AAAbids address (filled after deploy)
  weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  genesis: "0xa7a3022249415e25752C4cF8696c2418DEfdF2Db",
  signer: "injected", // "injected" | "local" (local = Anvil dev key, only on 31337)
};

export const CHAINS = {
  1: { name: "Ethereum (mainnet)", rpc: "https://eth.drpc.org", danger: true },
  11155111: { name: "Sepolia", rpc: "https://ethereum-sepolia-rpc.publicnode.com", danger: false },
  31337: { name: "Anvil (local fork)", rpc: "http://127.0.0.1:8545", danger: false },
};

// Well-known Anvil dev-account #0 (public test key). ONLY used when signer === "local" on 31337.
export const LOCAL_DEV_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

let cfg = load();
function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return { ...DEFAULTS };
  }
}
export const get = () => cfg;
export function set(patch) {
  cfg = { ...cfg, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(cfg));
  } catch {}
  return cfg;
}
export const chainMeta = () => CHAINS[cfg.chainId] || { name: `chain ${cfg.chainId}`, rpc: cfg.rpc, danger: cfg.chainId === 1 };
export const isMainnet = () => cfg.chainId === 1;
export const isLocal = () => cfg.chainId === 31337;
