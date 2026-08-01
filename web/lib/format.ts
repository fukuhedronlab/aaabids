import { formatEther } from "viem";

export function shortAddr(a?: string) {
  if (!a) return "";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function eth(wei?: bigint, dp = 4) {
  if (wei === undefined) return "—";
  const n = Number(formatEther(wei));
  return `${n.toLocaleString(undefined, { maximumFractionDigits: dp })} ETH`;
}

export function sameAddr(a?: string, b?: string) {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

export function timeLeft(expiry: bigint): string {
  if (expiry === 0n) return "No expiry";
  const secs = Number(expiry) - Math.floor(Date.now() / 1000);
  if (secs <= 0) return "Expired";
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}
