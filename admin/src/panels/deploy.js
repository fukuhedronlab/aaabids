/** Deploy — browser deploy of AAAbids with its constructor args. Saves the address to the console. */
import { h, field, input } from "../lib/dom.js";
import { AAABIDS_ABI, AAABIDS_BYTECODE } from "../artifacts.js";
import { deploy } from "../lib/chain.js";
import * as cfg from "../config.js";
import { get, toast } from "../lib/store.js";
import { isAddr, txError } from "../lib/format.js";

export function render() {
  const acct = get().account || "";
  const f = {
    weth: input({ value: cfg.get().weth }),
    genesis: input({ value: cfg.get().genesis }),
    feeRecipient: input({ value: acct, placeholder: "0x… platform fee receiver" }),
    royaltyReceiver: input({ value: "", placeholder: "0x… blank = collection artist" }),
    admin: input({ value: acct, placeholder: "0x… ideally a multisig" }),
    feeBps: input({ value: "250" }),
    royaltyBps: input({ value: "500" }),
  };
  const ZERO = "0x0000000000000000000000000000000000000000";
  const log = h("div", { class: "deploylog mono" });
  const line = (s) => log.append(h("div", {}, s));

  const run = h("button", { class: "primary" }, "Deploy AAAbids");
  run.onclick = async () => {
    if (!get().account) return toast("Connect a wallet first.", "error");
    for (const [k, el] of Object.entries(f)) {
      if (["weth", "genesis", "feeRecipient", "admin"].includes(k) && !isAddr(el.value)) return toast(`Invalid ${k} address.`, "error");
    }
    const feeBps = Number(f.feeBps.value);
    const royaltyBps = Number(f.royaltyBps.value);
    if (feeBps + royaltyBps > 3000) return toast("fee + royalty must be ≤ 3000 bps (30%).", "error");
    const royaltyReceiver = f.royaltyReceiver.value.trim() || ZERO;
    if (royaltyReceiver !== ZERO && !isAddr(royaltyReceiver)) return toast("Invalid royalty wallet address.", "error");
    if (cfg.isMainnet() && prompt("MAINNET deploy. Prefer `forge script … --verify` for verified source. Type DEPLOY to continue anyway.") !== "DEPLOY") return;

    run.disabled = true;
    log.replaceChildren();
    try {
      line("Deploying AAAbids…");
      const { address, hash } = await deploy(AAABIDS_ABI, AAABIDS_BYTECODE, [
        f.weth.value.trim(),
        f.genesis.value.trim(),
        f.feeRecipient.value.trim(),
        BigInt(feeBps),
        BigInt(royaltyBps),
        royaltyReceiver,
        f.admin.value.trim(),
      ]);
      line("  royalty wallet = " + royaltyReceiver + (royaltyReceiver === ZERO ? " (collection artist)" : ""));
      line("  tx = " + hash);
      line("  AAAbids = " + address);
      cfg.set({ bids: address });
      line("✓ Saved to this console. Go to Manage to configure it.");
      toast("Deployed. Address saved.", "success");
    } catch (e) {
      line("✗ " + txError(e));
      toast("Deploy failed — see log.", "error");
    } finally {
      run.disabled = false;
    }
  };

  return h("div", { class: "panel" },
    h("h2", {}, "Deploy AAAbids"),
    h("p", { class: "sub" }, "Deploys the bidding contract with your wallet. All values below are also changeable later in Manage. weth & genesis are immutable — set them correctly here."),
    h("div", { class: "grid2" },
      field("WETH", f.weth, "Immutable · mainnet WETH by default"),
      field("Genesis (AAA registry)", f.genesis, "Immutable · membership + artist source"),
      field("Fee recipient", f.feeRecipient),
      field("Artist / royalty wallet", f.royaltyReceiver, "Blank = collection's on-chain artist (genesis.artist)"),
      field("Admin / owner", f.admin, "Controls all settings post-deploy"),
      field("Platform fee (bps)", f.feeBps, "250 = 2.5%"),
      field("Artist royalty (bps)", f.royaltyBps, "500 = 5% · fee+royalty ≤ 30%"),
    ),
    h("div", { class: "row" }, run),
    log,
  );
}
