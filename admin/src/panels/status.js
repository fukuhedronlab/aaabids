/** Status — read-only overview of the deployed contract. */
import { h } from "../lib/dom.js";
import { AAABIDS_ABI } from "../artifacts.js";
import * as chain from "../lib/chain.js";
import * as cfg from "../config.js";
import { short, isAddr } from "../lib/format.js";

const target = () => ({ address: cfg.get().bids, abi: AAABIDS_ABI });

export function render() {
  const wrap = h("div", { class: "panel" }, h("h2", {}, "Status"));
  if (!isAddr(cfg.get().bids)) {
    wrap.append(h("p", { class: "sub" }, "No contract address set."));
    return wrap;
  }
  const grid = h("div", { class: "stategrid" }, h("div", { class: "muted" }, "Loading…"));
  wrap.append(h("p", { class: "sub" }, `${cfg.chainMeta().name} · ${short(cfg.get().bids)}`), grid);
  load(grid);
  return wrap;
}

async function load(grid) {
  const t = target();
  try {
    const [paused, nextId, maxBps, feeBps, royaltyBps, owner] = await Promise.all([
      chain.read(t, "paused"),
      chain.read(t, "nextOfferId"),
      chain.read(t, "MAX_TOTAL_BPS"),
      chain.read(t, "feeBps"),
      chain.read(t, "royaltyBps"),
      chain.read(t, "owner"),
    ]);
    const row = (k, v) => h("div", { class: "st" }, h("span", { class: "st-k" }, k), h("span", { class: "st-v mono" }, v));
    grid.replaceChildren(
      row("Status", paused ? "⏸ PAUSED" : "● Active"),
      row("Owner", short(owner)),
      row("Offers created", String(nextId)),
      row("Fee + royalty", `${(Number(feeBps) + Number(royaltyBps)) / 100}% of ${Number(maxBps) / 100}% cap`),
    );
  } catch (e) {
    grid.replaceChildren(h("div", { class: "status err" }, "Read failed: " + (e.shortMessage || e.message)));
  }
}
