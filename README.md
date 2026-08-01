# AAAbids

A non-custodial **bidding / offer-book marketplace** for the
[**Artificial After All**](https://artificial.han.io) collection by Han Saglam (hanrgb) — a set of
256 standalone Ethereum contracts, each an on-chain generative piece.

The collection's own contracts only support **fixed-price** sales (`listForSale` → `buyNow`). This
project adds what they don't have: **bids**. Anyone can bid on a specific piece, or place a
**collection-wide offer for a chosen quantity** of pieces at a price each; the owner of any eligible
piece accepts, and it changes hands — with the **artist paid a royalty** and the **platform paid a
fee** on every accepted bid. The app auto-detects which pieces your wallet owns (no buyer/seller
role selection) and lets you pick which one to sell.

> Status: **contract + frontend complete and verified end-to-end against a mainnet fork of the
> real collection** (15/15 contract tests passing, including a quantity-2 collection offer filled
> by two real pieces and a drain-resistance test; the full place-bid / cancel / accept flow driven
> through the UI, with pieces actually transferring and seller, artist, and platform all paid).

---

## Why this is not a normal NFT marketplace

We reverse-engineered the collection's (unverified) contracts down to the opcode level. The findings
drive the entire design:

| Fact | Consequence |
|---|---|
| Pieces are **not ERC-721**. No `approve` / `transferFrom` / `ownerOf`. Ownership is OpenZeppelin `Ownable`; the only way a piece moves is the owner calling **`transferOwnership`**. | A bid contract **cannot pull** a piece from a wallet. Accepting a bid has to be structured carefully. |
| `buyNow()` credits **100% of the price to the seller** (`pendingWithdrawals[owner] += msg.value`) and makes the payer the new owner. It is internally **atomic** (pay-or-revert) and makes **no external call**. | We route the sale through `buyNow` so an owner **can never lose their piece without being paid**, even if our contract has a bug. |
| **No secondary royalty exists.** `buyNow` pays the artist nothing; `transferOwnership` is a free transfer. "Royalties" apply only to the **primary mint**. | To pay the artist on resales, **our contract pays the royalty explicitly.** |
| The genesis/registry (`0xa7a3…f2Db`) exposes **`isArtificial(address)`** and **`artist()`**. | Clean **on-chain membership check** (no hardcoded list of 256) and a canonical **royalty recipient**. |
| `currentOffer()` is a **for-sale flag** (1/0), not the price. The price lives in storage slot 2 and is only enforced inside `buyNow`. | We check "is listed" via `currentOffer()` and let `buyNow` enforce the exact amount. |

## How an accepted bid settles

Each accepted fill of `pricePerItem` WETH splits into (a collection offer for `quantity` pieces is
filled one piece at a time, up to `quantity`):

```
sellerProceeds = pricePerItem − royalty − fee      → paid to the seller via the piece's own buyNow
royalty        = pricePerItem × royaltyBps / 10000 → paid to the artist (genesis.artist())
fee            = pricePerItem × feeBps    / 10000  → paid to the platform
```

All in **one atomic transaction**:

1. Bidder places an offer (no escrow — backed by a **WETH allowance**, cancelable anytime).
2. Owner lists the piece at `sellerProceeds` via the piece's own `listForSale`.
   *(The piece is **not** transferred by listing — the owner still holds it.)*
3. Owner calls `acceptOffer`, which pulls the bidder's WETH → unwraps to ETH → calls the piece's
   `buyNow{value: sellerProceeds}` (paying the seller, making this contract the owner) →
   `transferOwnership(bidder)` → pays the artist royalty and platform fee.

**Owner safety:** if the bidder can't pay, the price is wrong, or anything reverts, the whole
transaction reverts and the owner keeps the piece. The owner can only ever part with the piece by
being paid inside `buyNow`.

**Known tradeoff:** step 2's `listForSale` is public, so a direct buyer could snipe the listing at
`sellerProceeds`. The owner is still paid, but the bidder/artist/platform are bypassed on that one
sale. The frontend mitigates this by submitting the listing + accept via a private mempool
(Flashbots Protect).

## Repo layout

```
contracts/   Foundry project — AAAbids.sol, Batcher (EIP-7702), interfaces, fork tests, deploy + enumerate scripts
web/         Next.js + wagmi/viem frontend — offer book, place/cancel bid, owner accept flow (deploys to Vercel)
admin/       Local-only Vite + viem operator console — deploy the contract + change variables + pause/resume
scripts/     dev-fork.sh / dev-seed.sh — one-command local mainnet-fork demo
```

## Contracts

```bash
cd contracts
forge build
MAINNET_RPC_URL=https://ethereum-rpc.publicnode.com forge test -vv   # runs against a mainnet fork
```

Deploy (all params overridable by env; all also changeable later by the admin on Etherscan):

```bash
forge script script/Deploy.s.sol --rpc-url $MAINNET_RPC_URL --broadcast --verify
```

### Admin knobs (all settable post-deploy, e.g. from Etherscan)
`setFeeBps`, `setRoyaltyBps` (capped so `fee + royalty ≤ 30%`), `setFeeRecipient`,
`setRoyaltyReceiverOverride` (0 = use `genesis.artist()`), `pause` / `unpause`, and two-step
ownership transfer.

**Immutable by design** (security anchors, *not* editable): `weth` and `genesis`. If `genesis` could
be swapped, a malicious admin could point it at a fake registry and drain a bidder's WETH via a
no-op "piece". The `30%` fee+royalty cap is likewise a constant so admin can't confiscate a sale. A
`test_CannotDrainBidder_WithFakePiece` test locks in the guarantee.

## Frontend

Env-driven ([web/.env.example](web/.env.example)): point it at your deployed contract, chain, RPC,
and (optionally) a free [Reown/WalletConnect](https://cloud.reown.com) project id.

```bash
cd web
pnpm install
pnpm dev            # http://localhost:3000
```

### Backend (API proxies)

Two thin server-side routes keep API keys off the client and make reads robust:

- **`app/api/rpc`** — forwards JSON-RPC to your keyed `RPC_URL` (server env). **Read-only** methods are
  allowlisted; writes are rejected (those go through the user's wallet, not the proxy). Set
  `NEXT_PUBLIC_RPC_URL=/api/rpc` in production so the browser never sees your RPC key.
- **`app/api/etherscan`** — injects `ETHERSCAN_API_KEY` (server env) and forwards to Etherscan v2;
  read-only modules only. Used via [lib/etherscan.ts](web/lib/etherscan.ts) for reliable event
  history (`etherscanLogs`) and verification status.

Server-only vars (no `NEXT_PUBLIC_` prefix, never bundled): `RPC_URL`, `ETHERSCAN_API_KEY`. See
[web/.env.example](web/.env.example). The local fork demo talks to Anvil directly and doesn't need them.

### Local end-to-end demo (mainnet fork, no real ETH)

One command forks mainnet, deploys AAAbids, seeds demo bids, gives the demo seller a few real
pieces, and writes `web/.env.local`:

```bash
MAINNET_RPC_URL=https://your-rpc ./scripts/dev-fork.sh
cd web && pnpm dev            # http://localhost:3000
```

The demo enables a local "Demo Wallet" (Anvil's unlocked accounts); switch between the two accounts
in the header. The app auto-detects which pieces the connected wallet owns and shows selling options
accordingly — there is no buyer/seller role to pick. In production the app uses injected wallets +
WalletConnect only.

## Deploy to Vercel

The frontend is a standard Next.js app (App Router) and deploys to Vercel as-is (root directory
`web/`). Set the production env vars from [web/.env.example](web/.env.example) in the Vercel project —
in particular `NEXT_PUBLIC_*` for the chain/contract and the **server-only** `RPC_URL` /
`ETHERSCAN_API_KEY` — then point your domain at it. The API proxy routes
run as Vercel serverless functions automatically.

## License

MIT.
