"use client";

import type { Address } from "viem";
import { shortAddr } from "@/lib/format";
import { pieceLabel } from "@/lib/pieces";

/**
 * Shown automatically when the connected wallet owns pieces in the collection — no role selection.
 * Lists the owned pieces; accepting bids happens in the Bids panel ("Sell into this").
 */
export function SellerPanel({ owned, loading }: { owned: Address[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="panel">
        <h2>Your collection</h2>
        <p className="sub">Checking which pieces this wallet owns…</p>
      </div>
    );
  }
  if (owned.length === 0) return null;

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
        <h2>Your collection</h2>
        <span className="tag accent">{owned.length} owned</span>
      </div>
      <p className="sub">
        You own {owned.length} {owned.length === 1 ? "piece" : "pieces"}. Accept any matching bid below
        with “Sell into this” — pick which piece when it&apos;s a collection offer.
      </p>
      <div className="piece-grid">
        {owned.map((p) => (
          <a
            key={p}
            className="piece-chip"
            href={`https://etherscan.io/address/${p}`}
            target="_blank"
            rel="noopener noreferrer"
            title={p}
          >
            <span className="pc-num">{pieceLabel(p)}</span>
            <span className="pc-addr mono">{shortAddr(p)}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
