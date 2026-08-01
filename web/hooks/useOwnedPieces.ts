"use client";

import { useCallback, useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import type { Address } from "viem";
import { pieceAbi } from "@/lib/abis";
import { PIECES } from "@/lib/pieces";

/**
 * Detects which of the 256 collection pieces `owner` holds, via a batched Multicall3 read of
 * `owner()` across every piece. This powers the automatic "seller" experience — no role selection.
 */
export function useOwnedPieces(owner?: Address) {
  const publicClient = usePublicClient();
  const [owned, setOwned] = useState<Address[]>([]);
  const [isLoading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!owner || !publicClient) {
      setOwned([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const results = await publicClient.multicall({
          contracts: PIECES.map((address) => ({ address, abi: pieceAbi, functionName: "owner" }) as const),
          allowFailure: true,
        });
        if (cancelled) return;
        const lc = owner.toLowerCase();
        const own: Address[] = [];
        results.forEach((r, i) => {
          if (r.status === "success" && (r.result as string)?.toLowerCase() === lc) own.push(PIECES[i]);
        });
        setOwned(own);
      } catch {
        if (!cancelled) setOwned([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [owner, publicClient, nonce]);

  return { owned, isLoading, refetch };
}
