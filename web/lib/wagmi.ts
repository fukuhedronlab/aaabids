import { createConfig, http } from "wagmi";
import { mainnet } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";
import { defineChain } from "viem";
import { appConfig, isDemo, resolveRpcUrl } from "./config";
import { demoConnector } from "./demoConnector";

const transportUrl = resolveRpcUrl();

// The active chain: either real mainnet, or the local Anvil fork (same state, chainId 31337).
export const activeChain =
  appConfig.chainId === mainnet.id
    ? mainnet
    : defineChain({
        id: appConfig.chainId,
        name: appConfig.chainName,
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: [transportUrl] } },
        // Multicall3 is deployed at this canonical address on mainnet, so it exists on the fork too.
        contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
      });

const siteUrl =
  typeof window !== "undefined" ? window.location.origin : appConfig.siteUrl || "https://localhost";

const connectors = [
  // Generic fallback for wallets that don't announce via EIP-6963 (older extensions). Modern
  // wallets are discovered automatically (multiInjectedProviderDiscovery below) and each shows up
  // as its own connector with a name + icon.
  injected({ shimDisconnect: true }),
  ...(appConfig.walletConnectProjectId
    ? [
        walletConnect({
          projectId: appConfig.walletConnectProjectId,
          metadata: {
            name: "AAAbids",
            description: "Bids & offers for the Artificial After All collection",
            url: siteUrl,
            icons: [`${siteUrl}/icon.svg`],
          },
          showQrModal: true,
        }),
      ]
    : []),
  ...(isDemo ? [demoConnector()] : []),
];

export const wagmiConfig = createConfig({
  chains: [activeChain],
  connectors,
  // Auto-discover every installed browser wallet (EIP-6963), so users with multiple extensions
  // (MetaMask, Rabby, Coinbase, Frame, …) can pick any of them.
  multiInjectedProviderDiscovery: true,
  transports: { [activeChain.id]: http(transportUrl) },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
