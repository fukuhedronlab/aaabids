# AAAbids — Admin Console

A **local-only** operator interface (Vite + viem, injected wallet) to **deploy** the AAAbids
contract and **change its variables** after deploy. Modeled on the Seedlings admin pattern.

> ⚠️ Local tool — do **not** deploy this publicly. It has no backend and never sees your private
> key (the wallet signs; this app only builds transactions). Only `web/` is meant to be hosted.

## Run

```bash
cd admin
pnpm install
pnpm dev            # http://localhost:5173
```

## Use

- **Top bar:** pick the network (Anvil / Sepolia / Mainnet). On Anvil you can switch the signer to
  a **Local Anvil key** to test without MetaMask; on any real network it's injected-wallet only.
- **Connect wallet** with the deployer/admin account.
- **Deploy** — sets `weth`, `genesis` (immutable), `feeRecipient`, `admin`, `feeBps`, `royaltyBps`;
  deploys and saves the address to the console (localStorage).
- **Manage** — reads the live config and lets you change every admin-settable variable:
  platform fee, artist royalty, fee recipient, royalty receiver override, **pause / resume**
  (emergency switch), and Ownable2Step ownership transfer/accept. Every write is **simulated
  first**, shows gas, and can copy raw calldata for a Safe/multisig.
- **Status** — read-only overview.

For a **verified** mainnet deploy, prefer `forge script contracts/script/Deploy.s.sol --verify`
(so Etherscan shows source); use this console's deploy for local/testnet or quick deploys.
