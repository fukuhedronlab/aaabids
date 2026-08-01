"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther, maxUint256, isAddress, type Address } from "viem";
import { aaaBidsAbi, wethAbi } from "@/lib/abis";
import { appConfig } from "@/lib/config";
import { eth } from "@/lib/format";

const ZERO = "0x0000000000000000000000000000000000000000" as Address;
const EXPIRY_OPTS = [
  { label: "No expiry", secs: 0 },
  { label: "1 day", secs: 86400 },
  { label: "7 days", secs: 7 * 86400 },
  { label: "30 days", secs: 30 * 86400 },
];

export function PlaceBid({ onDone }: { onDone?: () => void }) {
  const { address, isConnected } = useAccount();
  const [mode, setMode] = useState<"piece" | "collection">("collection");
  const [piece, setPiece] = useState<string>("");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("1");
  const [expiryIdx, setExpiryIdx] = useState(0);

  const priceWei = useMemo(() => {
    try {
      return parseEther(price || "0");
    } catch {
      return 0n;
    }
  }, [price]);
  const quantity = mode === "collection" ? Math.max(1, Math.floor(Number(qty) || 1)) : 1;

  const { data: feeBps } = useReadContract({ address: appConfig.bids, abi: aaaBidsAbi, functionName: "feeBps" });
  const { data: royaltyBps } = useReadContract({
    address: appConfig.bids,
    abi: aaaBidsAbi,
    functionName: "royaltyBps",
  });
  const { data: wethBal } = useReadContract({
    address: appConfig.weth,
    abi: wethAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: appConfig.weth,
    abi: wethAbi,
    functionName: "allowance",
    args: address ? [address, appConfig.bids] : undefined,
    query: { enabled: !!address },
  });

  const fee = feeBps ? (priceWei * BigInt(feeBps)) / 10000n : 0n;
  const royalty = royaltyBps ? (priceWei * BigInt(royaltyBps)) / 10000n : 0n;
  const seller = priceWei > fee + royalty ? priceWei - fee - royalty : 0n;
  const totalIfFilled = priceWei * BigInt(quantity);

  const needsApproval = (allowance ?? 0n) < priceWei;
  const pieceValid = mode === "collection" || isAddress(piece);
  const canBid = isConnected && priceWei > 0n && pieceValid && !needsApproval && (wethBal ?? 0n) >= priceWei;

  const approve = useWriteContract();
  const bid = useWriteContract();
  const approveRcpt = useWaitForTransactionReceipt({ hash: approve.data });
  const bidRcpt = useWaitForTransactionReceipt({ hash: bid.data });

  useEffect(() => {
    if (approveRcpt.isSuccess) {
      refetchAllowance();
      approve.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveRcpt.isSuccess]);
  useEffect(() => {
    if (bidRcpt.isSuccess) {
      onDone?.();
      bid.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bidRcpt.isSuccess]);

  function submitApprove() {
    approve.writeContract({
      address: appConfig.weth,
      abi: wethAbi,
      functionName: "approve",
      args: [appConfig.bids, maxUint256],
    });
  }
  function submitBid() {
    const target = mode === "collection" ? ZERO : (piece as Address);
    const secs = EXPIRY_OPTS[expiryIdx].secs;
    const expiry = secs === 0 ? 0n : BigInt(Math.floor(Date.now() / 1000) + secs);
    bid.writeContract({
      address: appConfig.bids,
      abi: aaaBidsAbi,
      functionName: "createOffer",
      args: [target, priceWei, quantity, expiry],
    });
  }

  const busy = approve.isPending || approveRcpt.isLoading || bid.isPending || bidRcpt.isLoading;

  return (
    <div className="panel">
      <h2>Place a bid</h2>
      <p className="sub">Backed by your WETH — no funds are locked, cancel anytime.</p>

      <div className="stack">
        <div className="filters" role="tablist">
          <button className="chip" data-active={mode === "collection"} onClick={() => setMode("collection")}>
            Entire collection
          </button>
          <button className="chip" data-active={mode === "piece"} onClick={() => setMode("piece")}>
            Specific piece
          </button>
        </div>

        {mode === "piece" && (
          <div>
            <label>Piece contract</label>
            <input
              placeholder="0x…"
              value={piece}
              onChange={(e) => setPiece(e.target.value.trim())}
              spellCheck={false}
            />
            {!pieceValid && piece.length > 0 && <div className="err">Not a valid address.</div>}
          </div>
        )}

        <div className="field-row">
          <div style={{ flex: 2 }}>
            <label>{mode === "collection" ? "Price per piece" : "Bid amount"}</label>
            <input
              inputMode="decimal"
              placeholder="0.0"
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))}
            />
          </div>
          {mode === "collection" && (
            <div style={{ flex: 1 }}>
              <label>Quantity</label>
              <input
                inputMode="numeric"
                value={qty}
                onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, ""))}
              />
            </div>
          )}
          <div style={{ flex: 1.4 }}>
            <label>Expiry</label>
            <select value={expiryIdx} onChange={(e) => setExpiryIdx(Number(e.target.value))}>
              {EXPIRY_OPTS.map((o, i) => (
                <option key={o.label} value={i}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {mode === "collection" && quantity > 1 && (
          <div className="muted" style={{ fontSize: 12.5 }}>
            Buying up to <b>{quantity}</b> pieces · total if fully filled: <b>{eth(totalIfFilled)}</b>
          </div>
        )}

        <div className="split">
          <span className="k">Seller receives {mode === "collection" ? "(each)" : ""}</span>
          <span className="v">{eth(seller)}</span>
          <span className="k">Artist royalty ({Number(royaltyBps ?? 0) / 100}%)</span>
          <span className="v">{eth(royalty)}</span>
          <span className="k">Platform fee ({Number(feeBps ?? 0) / 100}%)</span>
          <span className="v">{eth(fee)}</span>
        </div>

        {isConnected && (
          <div className="muted" style={{ fontSize: 12.5 }}>
            Your WETH: {eth(wethBal)} · Allowance:{" "}
            {(allowance ?? 0n) > 10n ** 30n ? "Unlimited" : eth(allowance)}
          </div>
        )}

        {!isConnected ? (
          <div className="notice">Connect a wallet to place a bid.</div>
        ) : needsApproval ? (
          <button className="btn-accent" disabled={busy || priceWei === 0n} onClick={submitApprove}>
            {busy ? "Approving…" : "Approve WETH"}
          </button>
        ) : (
          <button className="btn-accent" disabled={!canBid || busy} onClick={submitBid}>
            {busy ? "Placing…" : "Place bid"}
          </button>
        )}

        {(wethBal ?? 0n) < priceWei && isConnected && (
          <div className="err">You need at least {eth(priceWei)} WETH available to back this bid.</div>
        )}
        {approve.error && <div className="err">{approve.error.message}</div>}
        {bid.error && <div className="err">{bid.error.message}</div>}
      </div>
    </div>
  );
}
