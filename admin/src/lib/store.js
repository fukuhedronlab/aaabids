/** Minimal reactive store + toasts. */
let state = { account: null, chainId: null, toasts: [] };
const subs = new Set();

export const get = () => state;
export function set(patch) {
  state = { ...state, ...patch };
  subs.forEach((fn) => fn(state));
  return state;
}
export function subscribe(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

let tid = 0;
export function toast(message, kind = "info", ms = 6000) {
  const id = ++tid;
  set({ toasts: [...state.toasts, { id, message, kind }] });
  if (ms) setTimeout(() => dismissToast(id), ms);
  return id;
}
export function dismissToast(id) {
  set({ toasts: state.toasts.filter((t) => t.id !== id) });
}
