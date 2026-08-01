/** Hash router. */
const routes = new Map();
let onChange = () => {};

export const register = (key, render) => routes.set(key, render);
export const current = () => (location.hash.replace(/^#/, "") || "deploy");
export const go = (key) => {
  location.hash = key;
};

export function start(cb) {
  onChange = cb;
  window.addEventListener("hashchange", tick);
  tick();
}
function tick() {
  const key = current();
  const render = routes.get(key) || routes.get("deploy");
  onChange(key, render);
}
