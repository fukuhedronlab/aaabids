"use client";

import { useAccount } from "wagmi";
import { ConnectButton } from "@/components/ConnectButton";
import { PlaceBid } from "@/components/PlaceBid";
import { OfferBook } from "@/components/OfferBook";
import { SellerPanel } from "@/components/SellerPanel";
import { useOwnedPieces } from "@/hooks/useOwnedPieces";
import { appConfig, isDemo } from "@/lib/config";

export default function Home() {
  const { address, isConnected, chain } = useAccount();
  const { owned, isLoading: ownedLoading } = useOwnedPieces(address);

  return (
    <div className="wrap">
      <header className="masthead">
        <div className="brand">
          AAAbids
          <small>
            Bids &amp; offers for{" "}
            <a href="https://artificial.han.io" target="_blank" rel="noopener noreferrer">
              Artificial After All ↗
            </a>
          </small>
        </div>
        <div className="masthead-right">
          {isDemo && (
            <span className="demobar" title="Running on a local mainnet fork">
              ◆ {appConfig.chainName}
            </span>
          )}
          <ConnectButton />
        </div>
      </header>

      {isDemo && (
        <div className="notice" style={{ marginTop: 16 }}>
          Demo on a local mainnet fork with the real collection. Connect the demo wallet (switch
          between accounts in the header) — the app automatically shows selling options for whichever
          wallet owns pieces. No real ETH is spent.
        </div>
      )}

      {isConnected && <SellerPanel owned={owned} loading={ownedLoading} />}

      <main className="grid">
        <PlaceBid />
        <OfferBook ownedPieces={owned} />
      </main>

      <footer>
        <div className="footer-inner">
          <span>
            Non-custodial bids for Artificial After All · settles through each piece&apos;s own{" "}
            <span className="mono">buyNow</span>, pays the artist a royalty, never lets an owner lose a
            piece unpaid.
          </span>
          <span className="footer-links">
            {appConfig.githubUrl && (
              <a href={appConfig.githubUrl} target="_blank" rel="noopener noreferrer">
                GitHub ↗
              </a>
            )}
            <span className="mono">{chain?.name ?? appConfig.chainName}</span>
          </span>
        </div>
      </footer>
    </div>
  );
}
