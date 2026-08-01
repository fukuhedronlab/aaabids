/**
 * actionCard — one reusable write form. Renders inputs, SIMULATES before sending (a doomed tx
 * never reaches your wallet), shows gas cost, can copy raw calldata (for a Safe/multisig), and
 * type-to-confirms anything irreversible or on mainnet.
 */
import { h } from "../lib/dom.js";
import * as chain from "../lib/chain.js";
import { toast, get } from "../lib/store.js";
import { txError } from "../lib/format.js";
import { isMainnet } from "../config.js";

/**
 * @param o.label,o.desc
 * @param o.target ()=>({address,abi})   resolved at click time
 * @param o.abi     ABI (for calldata)
 * @param o.fn      function name
 * @param o.fields  [{name,label,placeholder,hint,type,options,value,parse}]
 * @param o.args    ()=>any[]  (else derived from fields)
 * @param o.danger  bool → require typed confirmation
 * @param o.confirmWord  default "CONFIRM"
 * @param o.onDone  (hash)=>void
 */
export function actionCard(o) {
  const inputs = {};
  const fieldEls = (o.fields || []).map((f) => {
    let el;
    if (f.type === "select") {
      el = h("select", {}, (f.options || []).map((op) => h("option", { value: op.value, selected: op.value === f.value ? "" : null }, op.label)));
    } else {
      el = h("input", { type: "text", spellcheck: "false", placeholder: f.placeholder || "", value: f.value ?? "" });
    }
    inputs[f.name] = el;
    return h("label", { class: "field" }, h("span", { class: "lab" }, f.label || f.name), el, f.hint && h("span", { class: "hint" }, f.hint));
  });

  const buildArgs = () => (o.args ? o.args() : (o.fields || []).map((f) => (f.parse ? f.parse(inputs[f.name].value) : inputs[f.name].value.trim())));

  const status = h("div", { class: "status" });
  const simBtn = h("button", { class: "ghost" }, "Simulate");
  const sendBtn = h("button", { class: "primary" }, "Send");
  const cdBtn = h("button", { class: "ghost", title: "Copy ABI-encoded calldata (for a Safe/hardware flow)" }, "Calldata");
  const confirmWrap = o.danger
    ? h("label", { class: "field confirm" }, h("span", { class: "lab" }, `Type ${o.confirmWord || "CONFIRM"} to enable`), (inputs.__confirm = h("input", { type: "text", placeholder: o.confirmWord || "CONFIRM" })))
    : null;

  simBtn.onclick = async () => {
    status.className = "status";
    status.textContent = "Simulating…";
    try {
      const args = buildArgs();
      let cost = null;
      try { cost = await chain.estimateCost(o.target(), o.fn, args); } catch {}
      await chain.simulate(o.target(), o.fn, args);
      status.className = "status ok";
      status.textContent = "✓ Simulation passed" + (cost ? ` · ~${(+cost.eth).toFixed(5)} ETH gas` : "");
    } catch (e) {
      status.className = "status err";
      status.textContent = "✗ " + txError(e);
    }
  };

  cdBtn.onclick = async () => {
    try {
      const data = chain.encodeCall(o.abi, o.fn, buildArgs());
      await navigator.clipboard.writeText(data);
      toast("Calldata copied.", "success");
    } catch (e) { toast(txError(e), "error"); }
  };

  sendBtn.onclick = async () => {
    if (!get().account) return toast("Connect a wallet first.", "error");
    if (o.danger && (inputs.__confirm?.value || "").trim() !== (o.confirmWord || "CONFIRM")) return toast("Type the confirmation word to proceed.", "error");
    if (isMainnet() && prompt(`MAINNET action: ${o.label}. Type SEND to proceed.`) !== "SEND") return;
    sendBtn.disabled = true;
    status.className = "status";
    status.textContent = "Sending…";
    try {
      const hash = await chain.send(o.target(), o.fn, buildArgs());
      status.textContent = "Waiting for confirmation…";
      await chain.waitFor(hash);
      status.className = "status ok";
      status.textContent = "✓ Done · " + hash.slice(0, 10) + "…";
      toast(o.label + " confirmed.", "success");
      o.onDone && o.onDone(hash);
    } catch (e) {
      status.className = "status err";
      status.textContent = "✗ " + txError(e);
    } finally {
      sendBtn.disabled = false;
    }
  };

  return h("div", { class: "card" },
    h("div", { class: "card-h" }, h("h3", {}, o.label), o.desc && h("p", { class: "desc" }, o.desc)),
    ...fieldEls,
    confirmWrap,
    h("div", { class: "row" }, simBtn, sendBtn, cdBtn),
    status,
  );
}
