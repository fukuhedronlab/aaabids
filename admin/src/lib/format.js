export const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
export const same = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
export const isAddr = (v) => /^0x[0-9a-fA-F]{40}$/.test((v || "").trim());
export function txError(e) {
  return e?.shortMessage || e?.details || e?.message || String(e);
}
