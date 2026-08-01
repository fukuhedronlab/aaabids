/** Manage — read current config and change every admin-settable variable, incl. pause/resume. */
import { h } from "../lib/dom.js";
import { AAABIDS_ABI } from "../artifacts.js";
import { actionCard } from "../ui/action.js";
import * as chain from "../lib/chain.js";
import * as cfg from "../config.js";
import { short, isAddr } from "../lib/format.js";

const target = () => ({ address: cfg.get().bids, abi: AAABIDS_ABI });
const bpsParse = (v) => BigInt(Math.floor(Number(v || "0")));
const addrParse = (v) => v.trim();

export function render() {
  const wrap = h("div", { class: "panel" }, h("h2", {}, "Manage"));
  if (!isAddr(cfg.get().bids)) {
    wrap.append(h("p", { class: "sub" }, "No contract address set. Deploy one, or paste an address in the Contract field above."));
    return wrap;
  }

  const stateEl = h("div", { class: "stategrid" }, h("div", { class: "muted" }, "Loading current settings…"));
  const cardsEl = h("div", { class: "cards" });
  wrap.append(h("p", { class: "sub" }, `Contract ${short(cfg.get().bids)} — every value here is admin-settable. Each write is simulated before it reaches your wallet.`), stateEl, cardsEl);

  load(stateEl, cardsEl);
  return wrap;
}

async function load(stateEl, cardsEl) {
  const t = target();
  let s = {};
  try {
    const [owner, pending, feeBps, royaltyBps, feeRecipient, override, effReceiver, paused, weth, genesis] = await Promise.all([
      chain.read(t, "owner"),
      chain.read(t, "pendingOwner"),
      chain.read(t, "feeBps"),
      chain.read(t, "royaltyBps"),
      chain.read(t, "feeRecipient"),
      chain.read(t, "royaltyReceiverOverride"),
      chain.read(t, "royaltyReceiver"),
      chain.read(t, "paused"),
      chain.read(t, "weth"),
      chain.read(t, "genesis"),
    ]);
    s = { owner, pending, feeBps, royaltyBps, feeRecipient, override, effReceiver, paused, weth, genesis };
  } catch (e) {
    stateEl.replaceChildren(h("div", { class: "status err" }, "Could not read contract: " + (e.shortMessage || e.message)));
    return;
  }

  const row = (k, v) => h("div", { class: "st" }, h("span", { class: "st-k" }, k), h("span", { class: "st-v mono" }, v));
  stateEl.className = "stategrid";
  stateEl.replaceChildren(
    row("Status", s.paused ? "⏸ PAUSED" : "● Active"),
    row("Owner", short(s.owner)),
    row("Pending owner", s.pending === "0x0000000000000000000000000000000000000000" ? "—" : short(s.pending)),
    row("Platform fee", `${Number(s.feeBps) / 100}% (${s.feeBps} bps)`),
    row("Artist royalty", `${Number(s.royaltyBps) / 100}% (${s.royaltyBps} bps)`),
    row("Fee recipient", short(s.feeRecipient)),
    row("Royalty → ", short(s.effReceiver) + (s.override === "0x0000000000000000000000000000000000000000" ? " (genesis.artist)" : " (override)")),
    row("WETH", short(s.weth) + " · immutable"),
    row("Genesis", short(s.genesis) + " · immutable"),
  );

  const refresh = () => load(stateEl, cardsEl);

  cardsEl.replaceChildren(
    // Pause / resume — the emergency switch.
    h("div", { class: "card pausecard" },
      h("div", { class: "card-h" }, h("h3", {}, "Emergency switch"), h("p", { class: "desc" }, "Pause blocks new bids and accepts. Existing offers can still be cancelled; funds are never locked.")),
      h("div", { class: "row" },
        pauseButton(s.paused ? "unpause" : "pause", s.paused, refresh),
      ),
    ),
    actionCard({
      label: "Set platform fee", desc: "Basis points of each sale (fee + royalty ≤ 3000).",
      target, abi: AAABIDS_ABI, fn: "setFeeBps",
      fields: [{ name: "bps", label: "Fee (bps)", value: String(s.feeBps), parse: bpsParse, hint: "250 = 2.5%" }],
      onDone: refresh,
    }),
    actionCard({
      label: "Set artist royalty", desc: "Basis points paid to the royalty receiver on each sale.",
      target, abi: AAABIDS_ABI, fn: "setRoyaltyBps",
      fields: [{ name: "bps", label: "Royalty (bps)", value: String(s.royaltyBps), parse: bpsParse, hint: "500 = 5%" }],
      onDone: refresh,
    }),
    actionCard({
      label: "Set fee recipient", desc: "Where platform fees are sent.",
      target, abi: AAABIDS_ABI, fn: "setFeeRecipient",
      fields: [{ name: "to", label: "Address", value: s.feeRecipient, parse: addrParse }],
      onDone: refresh,
    }),
    actionCard({
      label: "Set royalty receiver", desc: "Override the artist royalty address. Use the zero address to fall back to genesis.artist().",
      target, abi: AAABIDS_ABI, fn: "setRoyaltyReceiverOverride",
      fields: [{ name: "to", label: "Address (0x0 = genesis artist)", value: s.override, parse: addrParse }],
      onDone: refresh,
    }),
    actionCard({
      label: "Transfer ownership", desc: "Ownable2Step: sets a pending owner who must then call Accept ownership.",
      target, abi: AAABIDS_ABI, fn: "transferOwnership",
      fields: [{ name: "to", label: "New owner", placeholder: "0x…", parse: addrParse }],
      danger: true, confirmWord: "TRANSFER",
      onDone: refresh,
    }),
    actionCard({
      label: "Accept ownership", desc: "Called by the pending owner to complete a transfer.",
      target, abi: AAABIDS_ABI, fn: "acceptOwnership", args: () => [],
      onDone: refresh,
    }),
  );
}

function pauseButton(fn, paused, refresh) {
  const btn = h("button", { class: paused ? "primary" : "warn" }, paused ? "Resume (unpause)" : "Pause contract");
  btn.onclick = async () => {
    const { send, waitFor } = chain;
    try {
      btn.disabled = true;
      const hash = await send(target(), fn, []);
      await waitFor(hash);
      const { toast } = await import("../lib/store.js");
      toast(paused ? "Resumed." : "Paused.", "success");
      refresh();
    } catch (e) {
      const { toast } = await import("../lib/store.js");
      toast(e.shortMessage || e.message, "error");
    } finally {
      btn.disabled = false;
    }
  };
  return btn;
}
