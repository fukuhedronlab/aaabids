"use client";

import { useEffect, useState } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useCapabilities, useSendCalls, useCallsStatus } from "wagmi/experimental";
import { encodeFunctionData, type Address } from "viem";
import { aaaBidsAbi, pieceAbi } from "@/lib/abis";
import { appConfig } from "@/lib/config";
import { eth, sameAddr, shortAddr } from "@/lib/format";
import type { EnrichedOffer } from "@/hooks/useOffers";
import { pieceLabel } from "@/lib/pieces";

export function AcceptFlow({
  offer,
  ownedPieces,
  onDone,
}: {
  offer: EnrichedOffer;
  ownedPieces: Address[];
  onDone?: () => void;
}) {
  const { address, chainId } = useAccount();
  const eligible = offer.collectionWide
    ? ownedPieces
    : ownedPieces.filter((p) => sameAddr(p, offer.piece));
  const [piece, setPiece] = useState<Address | "">(eligible[0] ?? "");
  const selected = (piece || eligible[0] || "") as Address | "";

  // Seller amount = pricePerItem − royalty − fee, computed locally with the same integer math as
  // the contract's _split (floored bps), so listForSale is set to the exact price buyNow enforces.
  const { data: feeBps } = useReadContract({ address: appConfig.bids, abi: aaaBidsAbi, functionName: "feeBps" });
  const { data: royaltyBps } = useReadContract({
    address: appConfig.bids,
    abi: aaaBidsAbi,
    functionName: "royaltyBps",
  });
  const sellerProceeds =
    feeBps !== undefined && royaltyBps !== undefined
      ? offer.pricePerItem -
        (offer.pricePerItem * BigInt(royaltyBps)) / 10000n -
        (offer.pricePerItem * BigInt(feeBps)) / 10000n
      : undefined;

  // Does the connected wallet support atomic batching (EIP-5792 / 7702)?
  const { data: caps } = useCapabilities({ query: { enabled: !!address } });
  const chainCaps = caps?.[chainId ?? appConfig.chainId] as
    | { atomic?: { status?: string }; atomicBatch?: { supported?: boolean } }
    | undefined;
  const atomicSupported =
    !!chainCaps &&
    (["supported", "ready"].includes(chainCaps.atomic?.status ?? "") ||
      chainCaps.atomicBatch?.supported === true);

  const canSettle = !!selected && sellerProceeds !== undefined;

  function buildCalls() {
    return [
      {
        to: selected as Address,
        data: encodeFunctionData({ abi: pieceAbi, functionName: "listForSale", args: [sellerProceeds!] }),
      },
      {
        to: appConfig.bids,
        data: encodeFunctionData({ abi: aaaBidsAbi, functionName: "acceptOffer", args: [offer.id, selected as Address] }),
      },
    ];
  }

  return (
    <div className="panel inset">
      <h2>Accept bid #{offer.id.toString()}</h2>
      <p className="sub">
        Sell one piece for {eth(offer.pricePerItem)}. The piece only moves when you&apos;re paid — if
        anything fails, you keep it.
      </p>

      <div className="stack">
        {eligible.length === 0 ? (
          <div className="notice">
            {offer.collectionWide
              ? "You don't own any pieces in this collection to sell into this offer."
              : "You don't own this piece."}
          </div>
        ) : (
          <>
            {offer.collectionWide && (
              <div>
                <label>Piece to sell</label>
                <select value={selected} onChange={(e) => setPiece(e.target.value as Address)}>
                  {eligible.map((p) => (
                    <option key={p} value={p}>
                      {pieceLabel(p)} · {shortAddr(p)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="split">
              <span className="k">You receive</span>
              <span className="v">{eth(sellerProceeds)}</span>
              <span className="k">Selling</span>
              <span className="v mono">{selected ? `${pieceLabel(selected)} · ${shortAddr(selected)}` : "—"}</span>
            </div>

            {atomicSupported ? (
              <AtomicAccept canSettle={canSettle} buildCalls={buildCalls} onDone={onDone} />
            ) : (
              <TwoStepAccept
                selected={selected}
                sellerProceeds={sellerProceeds}
                offerId={offer.id}
                onDone={onDone}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** One-click atomic accept for smart / EIP-7702 wallets — list + accept in a single transaction. */
function AtomicAccept({
  canSettle,
  buildCalls,
  onDone,
}: {
  canSettle: boolean;
  buildCalls: () => { to: Address; data: `0x${string}` }[];
  onDone?: () => void;
}) {
  const { sendCalls, data, isPending, error, reset } = useSendCalls();
  const id = (data as { id?: string } | undefined)?.id;
  const { data: status } = useCallsStatus({
    id: id as string,
    query: { enabled: !!id, refetchInterval: (q) => (q.state.data?.status === "success" ? false : 800) },
  });
  const confirmed = status?.status === "success";

  useEffect(() => {
    if (confirmed && id) {
      onDone?.();
      reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmed, id]);

  return (
    <>
      <button
        className="btn-accent"
        disabled={!canSettle || isPending || !!id}
        onClick={() => sendCalls({ calls: buildCalls(), forceAtomic: true })}
      >
        {isPending || (id && !confirmed) ? "Accepting…" : "Accept bid — 1 transaction"}
      </button>
      <div className="notice">
        Atomic wallet detected: listing and accepting happen in a single transaction, so the sale
        can&apos;t be sniped and the bidder is guaranteed the piece.
      </div>
      {error && <div className="err">{error.message}</div>}
    </>
  );
}

/** Fallback for plain EOAs: two separate transactions (small snipe window between them). */
function TwoStepAccept({
  selected,
  sellerProceeds,
  offerId,
  onDone,
}: {
  selected: Address | "";
  sellerProceeds: bigint | undefined;
  offerId: bigint;
  onDone?: () => void;
}) {
  const list = useWriteContract();
  const accept = useWriteContract();
  const listRcpt = useWaitForTransactionReceipt({ hash: list.data });
  const acceptRcpt = useWaitForTransactionReceipt({ hash: accept.data });

  const { data: listedFlag, refetch: refetchFlag } = useReadContract({
    address: selected || undefined,
    abi: pieceAbi,
    functionName: "currentOffer",
    query: { enabled: !!selected },
  });
  useEffect(() => {
    if (listRcpt.isSuccess) refetchFlag();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listRcpt.isSuccess]);
  useEffect(() => {
    if (acceptRcpt.isSuccess) onDone?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acceptRcpt.isSuccess]);
  const listed = (listedFlag ?? 0n) !== 0n;
  const listing = list.isPending || listRcpt.isLoading;
  const accepting = accept.isPending || acceptRcpt.isLoading;

  return (
    <>
      <div className="btn-steps">
        <button
          className="btn-sm"
          disabled={!selected || listing || sellerProceeds === undefined}
          onClick={() =>
            list.writeContract({
              address: selected as Address,
              abi: pieceAbi,
              functionName: "listForSale",
              args: [sellerProceeds!],
            })
          }
        >
          {listing ? "Listing…" : listed ? "Re-list at exact price" : `1 · List at ${eth(sellerProceeds)}`}
        </button>
        <button
          className="btn-accent btn-sm"
          disabled={!listed || accepting}
          onClick={() =>
            accept.writeContract({
              address: appConfig.bids,
              abi: aaaBidsAbi,
              functionName: "acceptOffer",
              args: [offerId, selected as Address],
            })
          }
        >
          {accepting ? "Accepting…" : "2 · Accept bid"}
        </button>
      </div>
      <div className="notice">
        Your wallet doesn&apos;t support atomic batching, so this is two transactions. Submit via a
        private mempool (Flashbots Protect) so the listing can&apos;t be sniped between them.
      </div>
      {list.error && <div className="err">{list.error.message}</div>}
      {accept.error && <div className="err">{accept.error.message}</div>}
    </>
  );
}
