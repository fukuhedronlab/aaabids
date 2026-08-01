"use client";

import { useCallback, useEffect, useState } from "react";
import { usePublicClient, useBlockNumber } from "wagmi";
import type { Address } from "viem";
import { aaaBidsAbi } from "@/lib/abis";
import { appConfig } from "@/lib/config";

export type OfferStatus = "active" | "sold" | "cancelled" | "expired";

export type EnrichedOffer = {
  id: bigint;
  bidder: Address;
  piece: Address; // zero address = collection-wide
  pricePerItem: bigint;
  expiry: bigint;
  quantity: number;
  filled: number;
  remaining: number;
  collectionWide: boolean;
  status: OfferStatus;
};

const ZERO = "0x0000000000000000000000000000000000000000";

export function useOffers() {
  const publicClient = usePublicClient();
  const { data: blockNumber } = useBlockNumber({ watch: true });
  const [offers, setOffers] = useState<EnrichedOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!publicClient || appConfig.bids === ZERO) return;
    try {
      const base = {
        address: appConfig.bids,
        abi: aaaBidsAbi,
        fromBlock: appConfig.deployBlock,
        toBlock: "latest" as const,
      };
      const [created, accepted, cancelled] = await Promise.all([
        publicClient.getContractEvents({ ...base, eventName: "OfferCreated" }),
        publicClient.getContractEvents({ ...base, eventName: "OfferAccepted" }),
        publicClient.getContractEvents({ ...base, eventName: "OfferCancelled" }),
      ]);

      const filledCount = new Map<string, number>();
      for (const e of accepted) {
        const id = (e.args as { id: bigint }).id.toString();
        filledCount.set(id, (filledCount.get(id) ?? 0) + 1);
      }
      const cancelledSet = new Set(
        cancelled.map((e) => (e.args as { id: bigint }).id.toString()),
      );

      const now = BigInt(Math.floor(Date.now() / 1000));
      const list: EnrichedOffer[] = created.map((e) => {
        const a = e.args as {
          id: bigint;
          bidder: Address;
          piece: Address;
          pricePerItem: bigint;
          quantity: number;
          expiry: bigint;
          collectionWide: boolean;
        };
        const idStr = a.id.toString();
        const quantity = Number(a.quantity);
        const filled = filledCount.get(idStr) ?? 0;
        const remaining = Math.max(0, quantity - filled);
        let status: OfferStatus = "active";
        if (cancelledSet.has(idStr)) status = "cancelled";
        else if (filled >= quantity) status = "sold";
        else if (a.expiry !== 0n && now > a.expiry) status = "expired";
        return {
          id: a.id,
          bidder: a.bidder,
          piece: a.piece,
          pricePerItem: a.pricePerItem,
          expiry: a.expiry,
          quantity,
          filled,
          remaining,
          collectionWide: a.collectionWide,
          status,
        };
      });

      list.sort((x, y) => Number(y.id - x.id));
      setOffers(list);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load offers");
    } finally {
      setLoading(false);
    }
  }, [publicClient]);

  useEffect(() => {
    load();
  }, [load, blockNumber]);

  return { offers, loading, error, refetch: load };
}
