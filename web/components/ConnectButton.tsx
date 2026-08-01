"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import type { Connector } from "wagmi";
import { useState } from "react";
import { appConfig, isDemo } from "@/lib/config";
import { switchDemoAccount } from "@/lib/demoConnector";
import { shortAddr } from "@/lib/format";

export function ConnectButton() {
  const { address, isConnected, connector } = useAccount();
  const { connect, connectors, error, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const [open, setOpen] = useState(false);
  const [demoIdx, setDemoIdx] = useState(0);

  // Every installed extension is discovered via EIP-6963 and appears as its own connector.
  const injectedConns = connectors.filter((c) => c.type === "injected");
  const named = injectedConns.filter((c) => c.id !== "injected");
  const generic = injectedConns.find((c) => c.id === "injected");
  // Prefer the named/discovered wallets; fall back to the generic window.ethereum if none announce.
  const browserWallets = named.length ? named : generic ? [generic] : [];
  const wcConn = connectors.find((c) => c.id === "walletConnect");
  const demoConn = connectors.find((c) => c.id === "demo");

  if (isConnected) {
    return (
      <div className="row">
        {isDemo && connector?.id === "demo" && (
          <select
            aria-label="Demo wallet"
            className="compact"
            value={demoIdx}
            onChange={(e) => {
              const i = Number(e.target.value);
              setDemoIdx(i);
              switchDemoAccount(i);
            }}
          >
            {appConfig.demoAccounts.map((a, i) => (
              <option key={a.address} value={i}>
                Demo wallet: {a.label}
              </option>
            ))}
          </select>
        )}
        <span className="mono" title={connector?.name}>
          {shortAddr(address)}
        </span>
        <button className="btn-ghost btn-sm" onClick={() => disconnect()}>
          Disconnect
        </button>
      </div>
    );
  }

  const pick = (conn: Connector, pre?: () => void) => {
    pre?.();
    connect({ connector: conn });
    setOpen(false);
  };

  return (
    <div className="wallet-menu">
      <button className="btn-sm" disabled={isPending} onClick={() => setOpen((o) => !o)}>
        {isPending ? "Connecting…" : "Connect Wallet ▾"}
      </button>
      {open && (
        <>
          <div className="menu-backdrop" onClick={() => setOpen(false)} />
          <div className="menu" role="menu">
            <div className="menu-label">Browser wallets</div>
            {browserWallets.length > 0 ? (
              browserWallets.map((c) => {
                // `icon` is present on EIP-6963-discovered connectors but not on the base type.
                const icon = (c as { icon?: string }).icon;
                return (
                  <button key={c.uid} className="menu-item" onClick={() => pick(c)} role="menuitem">
                    {icon ? (
                      <img src={icon} alt="" width={18} height={18} style={{ borderRadius: 3 }} />
                    ) : (
                      <span className="menu-dot" />
                    )}
                    <span>{c.name === "Injected" ? "Browser Wallet" : c.name}</span>
                  </button>
                );
              })
            ) : (
              <div className="menu-empty">No extension detected. Install MetaMask, Rabby, …</div>
            )}
            {wcConn && (
              <>
                <div className="menu-label">Or</div>
                <button className="menu-item" onClick={() => pick(wcConn)} role="menuitem">
                  <span className="menu-dot wc" />
                  <span>WalletConnect — mobile &amp; more</span>
                </button>
              </>
            )}
            {demoConn && (
              <>
                <div className="menu-label">Local demo</div>
                <button
                  className="menu-item"
                  onClick={() => pick(demoConn, () => {
                    setDemoIdx(0);
                    switchDemoAccount(0);
                  })}
                  role="menuitem"
                >
                  <span className="menu-dot" />
                  <span>Demo wallet (Anvil)</span>
                </button>
              </>
            )}
          </div>
        </>
      )}
      {error && <span className="err">{error.message}</span>}
    </div>
  );
}
