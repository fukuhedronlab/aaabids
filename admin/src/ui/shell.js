/** Admin shell — banner, top bar (network, signer, wallet), config row, nav, content, toasts. */
import { h } from "../lib/dom.js";
import { go, current } from "./router.js";
import * as wallet from "../lib/wallet.js";
import * as cfg from "../config.js";
import { resetPub } from "../lib/chain.js";
import { get, subscribe, dismissToast, toast } from "../lib/store.js";
import { short } from "../lib/format.js";

const NAV = [
  ["deploy", "Deploy"],
  ["manage", "Manage"],
  ["status", "Status"],
];

let bannerEl, topEl, cfgEl, navEl, contentEl, toastsEl;

export function buildShell(root) {
  bannerEl = h("div", {});
  topEl = h("header", { class: "topbar" });
  cfgEl = h("div", { class: "cfgbar" });
  navEl = h("nav", { class: "sidenav" });
  contentEl = h("main", { class: "content" });
  toastsEl = h("div", { class: "toasts" });
  root.replaceChildren(
    h("div", { class: "shell" }, bannerEl, topEl, cfgEl, h("div", { class: "body" }, navEl, contentEl), toastsEl),
  );
  renderBanner();
  renderTop();
  renderCfg();
  renderNav();
  renderToasts();
  subscribe(() => {
    renderTop();
    renderToasts();
  });
  return contentEl;
}

export const content = () => contentEl;
export const setActiveNav = () => renderNav();

function renderBanner() {
  bannerEl.className = cfg.isMainnet() ? "banner mainnet" : "banner";
  bannerEl.replaceChildren(
    cfg.isMainnet()
      ? h("span", {}, "⚠ MAINNET — real funds, irreversible. Double-check every parameter. Prefer deploying with forge for source verification.")
      : h("span", {}, `Local admin console · ${cfg.chainMeta().name} · this tool never sees your private key.`),
  );
}

function renderTop() {
  const { account } = get();
  const onChain = wallet.onRightChain();

  const netSel = h(
    "select",
    {
      title: "Network",
      onChange: (e) => {
        const id = Number(e.target.value);
        cfg.set({ chainId: id, rpc: cfg.CHAINS[id].rpc, signer: id === 31337 ? cfg.get().signer : "injected" });
        resetPub();
        location.reload();
      },
    },
    Object.entries(cfg.CHAINS).map(([id, m]) => h("option", { value: id, selected: Number(id) === cfg.get().chainId ? "" : null }, m.name)),
  );

  const signerSel = cfg.isLocal()
    ? h(
        "select",
        {
          title: "Signer",
          onChange: (e) => {
            cfg.set({ signer: e.target.value });
            wallet.disconnect();
            location.reload();
          },
        },
        h("option", { value: "injected", selected: cfg.get().signer === "injected" ? "" : null }, "Injected wallet"),
        h("option", { value: "local", selected: cfg.get().signer === "local" ? "" : null }, "Local Anvil key"),
      )
    : null;

  const walletBtn = account
    ? h("button", { class: onChain ? "ghost" : "warn", onClick: onChain ? wallet.disconnect : () => wallet.switchChain().catch((e) => toast(e.message, "error")) }, onChain ? short(account) : "Wrong network — switch")
    : h("button", { class: "primary", onClick: () => wallet.connect().catch((e) => toast(e.message, "error")) }, "Connect wallet");

  topEl.replaceChildren(h("div", { class: "brand" }, "AAAbids · Admin"), h("div", { class: "spacer" }), signerSel, netSel, walletBtn);
}

function renderCfg() {
  const bids = h("input", { type: "text", spellcheck: "false", value: cfg.get().bids, placeholder: "AAAbids address (set after deploy)" });
  const rpc = h("input", { type: "text", spellcheck: "false", value: cfg.get().rpc, placeholder: "RPC URL" });
  const save = h("button", { class: "ghost" }, "Save");
  save.onclick = () => {
    cfg.set({ bids: bids.value.trim(), rpc: rpc.value.trim() });
    resetPub();
    toast("Saved.", "success");
  };
  cfgEl.replaceChildren(
    h("label", { class: "field inline" }, h("span", { class: "lab" }, "Contract"), bids),
    h("label", { class: "field inline" }, h("span", { class: "lab" }, "RPC"), rpc),
    save,
  );
}

function renderNav() {
  navEl.replaceChildren(
    ...NAV.map(([key, label]) => h("button", { class: "navitem" + (current() === key ? " active" : ""), onClick: () => go(key) }, label)),
  );
}

function renderToasts() {
  const { toasts } = get();
  toastsEl.replaceChildren(
    ...toasts.map((t) => h("div", { class: "toast " + t.kind, onClick: () => dismissToast(t.id) }, t.message)),
  );
}
