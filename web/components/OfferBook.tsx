"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import type { Address } from "viem";
import { aaaBidsAbi } from "@/lib/abis";
import { appConfig } from "@/lib/config";
import { eth, sameAddr, shortAddr, timeLeft } from "@/lib/format";
import { pieceLabel } from "@/lib/pieces";
import { useOffers, type EnrichedOffer, type OfferStatus } from "@/hooks/useOffers";
import { AcceptFlow } from "./AcceptFlow";

type StatusFilter = "active" | "history" | "all";
type TypeFilter = "all" | "collection" | "piece";

const STATUS_TAG: Record<OfferStatus, { label: string; cls: string }> = {
  active: { label: "Active", cls: "accent" },
  sold: { label: "Sold", cls: "ok" },
  cancelled: { label: "Cancelled", cls: "dim" },
  expired: { label: "Expired", cls: "dim" },
};

export function OfferBook({ ownedPieces }: { ownedPieces: Address[] }) {
  const { address } = useAccount();
  const { offers, loading, error, refetch } = useOffers();
  const [status, setStatus] = useState<StatusFilter>("active");
  const [type, setType] = useState<TypeFilter>("all");
  const [mineOnly, setMineOnly] = useState(false);
  const [acceptId, setAcceptId] = useState<bigint | null>(null);

  const filtered = useMemo(() => {
    return offers.filter((o) => {
      if (status === "active" && o.status !== "active") return false;
      if (status === "history" && o.status === "active") return false;
      if (type === "collection" && !o.collectionWide) return false;
      if (type === "piece" && o.collectionWide) return false;
      if (mineOnly && !sameAddr(o.bidder, address)) return false;
      return true;
    });
  }, [offers, status, type, mineOnly, address]);

  function canAccept(o: EnrichedOffer): boolean {
    if (o.status !== "active" || sameAddr(o.bidder, address)) return false;
    return o.collectionWide ? ownedPieces.length > 0 : ownedPieces.some((p) => sameAddr(p, o.piece));
  }

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
        <h2>Bids</h2>
        <button className="btn-ghost btn-sm" onClick={() => refetch()}>
          Refresh
        </button>
      </div>
      <p className="sub">Standing offers on individual pieces and the whole collection.</p>

      <div className="filters">
        {(["active", "history", "all"] as StatusFilter[]).map((s) => (
          <button key={s} className="chip" data-active={status === s} onClick={() => setStatus(s)}>
            {s[0].toUpperCase() + s.slice(1)}
          </button>
        ))}
        <span className="divider" />
        {(["all", "collection", "piece"] as TypeFilter[]).map((t) => (
          <button key={t} className="chip" data-active={type === t} onClick={() => setType(t)}>
            {t === "all" ? "All types" : t === "collection" ? "Collection" : "Per-piece"}
          </button>
        ))}
        <button className="chip" data-active={mineOnly} onClick={() => setMineOnly((m) => !m)}>
          My bids
        </button>
      </div>

      {loading && offers.length === 0 ? (
        <div className="empty">Loading bids…</div>
      ) : error ? (
        <div className="err">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="empty">No bids match these filters.</div>
      ) : (
        filtered.map((o) => (
          <div key={o.id.toString()}>
            <OfferRow
              offer={o}
              isBidder={sameAddr(o.bidder, address)}
              canAccept={canAccept(o)}
              onAccept={() => setAcceptId(acceptId === o.id ? null : o.id)}
              acceptOpen={acceptId === o.id}
              onCancelled={refetch}
            />
            {acceptId === o.id && o.status === "active" && (
              <AcceptFlow
                offer={o}
                ownedPieces={ownedPieces}
                onDone={() => {
                  setAcceptId(null);
                  refetch();
                }}
              />
            )}
          </div>
        ))
      )}
    </div>
  );
}

function OfferRow({
  offer,
  isBidder,
  canAccept,
  acceptOpen,
  onAccept,
  onCancelled,
}: {
  offer: EnrichedOffer;
  isBidder: boolean;
  canAccept: boolean;
  acceptOpen: boolean;
  onAccept: () => void;
  onCancelled: () => void;
}) {
  const cancel = useWriteContract();
  const cancelRcpt = useWaitForTransactionReceipt({ hash: cancel.data });
  useEffect(() => {
    if (cancelRcpt.isSuccess) onCancelled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancelRcpt.isSuccess]);
  const tag = STATUS_TAG[offer.status];
  const multi = offer.collectionWide && offer.quantity > 1;

  return (
    <div className="offer">
      <div>
        <div className="amt">
          {eth(offer.pricePerItem)}
          {multi && <span className="per"> each</span>}
        </div>
        <div className="meta">
          {offer.collectionWide ? <span className="tag">Collection-wide</span> : <>Piece {pieceLabel(offer.piece)}</>}
          {multi ? ` · ${offer.remaining}/${offer.quantity} left` : ""} · by {shortAddr(offer.bidder)}
          {offer.status === "active" && offer.expiry !== 0n ? ` · ${timeLeft(offer.expiry)}` : ""}
        </div>
      </div>
      <div className="offer-actions">
        <span className={`tag ${tag.cls}`}>{tag.label}</span>
        {offer.status === "active" && isBidder && (
          <button
            className="btn-ghost btn-sm"
            disabled={cancel.isPending || cancelRcpt.isLoading}
            onClick={() =>
              cancel.writeContract({
                address: appConfig.bids,
                abi: aaaBidsAbi,
                functionName: "cancelOffer",
                args: [offer.id],
              })
            }
          >
            {cancel.isPending || cancelRcpt.isLoading ? "Cancelling…" : "Cancel"}
          </button>
        )}
        {canAccept && (
          <button className="btn-sm" data-active={acceptOpen} onClick={onAccept}>
            {acceptOpen ? "Close" : "Sell into this"}
          </button>
        )}
      </div>
    </div>
  );
}
