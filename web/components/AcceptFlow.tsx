"use client";

import { useEffect, useState } from "react";
import { useAccount, useReadContract } from "wagmi";
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

  // Accept is ALWAYS a single atomic transaction (list + accept batched via EIP-5792). This is the
  // only supported path — it's the only one that's snipe-proof and guarantees the bidder the piece.
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
        Listing and accepting happen in a single atomic transaction — the sale can&apos;t be sniped,
        the bidder is guaranteed the piece, and if anything fails you keep it.
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
              <div className="notice">
                Accepting requires a wallet that supports <b>batched transactions</b> (EIP-5792) so the
                list + accept run atomically. Connect MetaMask, Rabby, Coinbase Wallet, or any
                smart-account / EIP-7702 wallet and reopen this.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** The one accept path: list + accept in a single atomic transaction (EIP-5792 `wallet_sendCalls`). */
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
      {error && <div className="err">{error.message}</div>}
    </>
  );
}
