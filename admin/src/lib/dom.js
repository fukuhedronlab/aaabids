/** Tiny hyperscript — no framework. h(tag, props?, ...children). */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k === "html") el.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, v);
    }
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}
export const mount = (parent, node) => {
  parent.replaceChildren(node);
  return node;
};
export const input = (props = {}) => h("input", { type: "text", spellcheck: "false", ...props });
export const field = (label, el, hint) =>
  h("label", { class: "field" }, h("span", { class: "lab" }, label), el, hint && h("span", { class: "hint" }, hint));
