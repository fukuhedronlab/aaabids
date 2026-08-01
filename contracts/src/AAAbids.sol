// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import { IArtificial } from "./interfaces/IArtificial.sol";
import { IArtificialGenesis } from "./interfaces/IArtificialGenesis.sol";
import { IWETH } from "./interfaces/IWETH.sol";

/// @title AAAbids
/// @notice A non-custodial, WETH-backed offer book (bids) for the "Artificial After All"
///         collection, whose pieces are individual `Ownable` contracts rather than ERC-721
///         tokens. Anyone can place a standing offer on a specific piece, or a collection-wide
///         offer for a chosen quantity of pieces at a price each; the current owner of any
///         eligible piece accepts by routing the sale through the piece's own `buyNow`, which
///         guarantees the owner is paid atomically or the whole transaction reverts — an owner
///         can never lose a piece without being paid.
///
/// @dev Per accepted fill of `pricePerItem` WETH:
///        seller  = pricePerItem - royalty - fee      (paid via the piece's buyNow)
///        royalty = pricePerItem * royaltyBps / 10000  (paid to the artist)
///        fee     = pricePerItem * feeBps    / 10000   (paid to the platform)
///      `weth` and `genesis` are immutable security anchors: bidders grant this contract a WETH
///      allowance, and the only thing that can pull it is `acceptOffer` delivering a *genuine*
///      piece (membership proven by the immutable genesis). See README for the full threat model.
contract AAAbids is Ownable2Step, Pausable, ReentrancyGuard {
    // ---------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------

    uint256 public constant BPS_DENOMINATOR = 10_000;

    /// @notice Hard cap on (feeBps + royaltyBps) so admin can never confiscate a sale.
    uint256 public constant MAX_TOTAL_BPS = 3_000; // 30%

    // ---------------------------------------------------------------------
    // Immutable security anchors
    // ---------------------------------------------------------------------

    /// @notice Wrapped Ether used to fund bids. Immutable by design.
    IWETH public immutable weth;

    /// @notice AAA genesis/registry — canonical source of `isArtificial` and `artist()`.
    ///         Immutable by design: making it mutable would let a malicious admin swap in a fake
    ///         registry and drain bidder WETH via a no-op "piece". See README threat model.
    IArtificialGenesis public immutable genesis;

    // ---------------------------------------------------------------------
    // Admin-configurable economics
    // ---------------------------------------------------------------------

    address public feeRecipient;
    uint96 public feeBps;
    uint96 public royaltyBps;

    /// @notice If non-zero, overrides `genesis.artist()` as the royalty recipient.
    address public royaltyReceiverOverride;

    // ---------------------------------------------------------------------
    // Offer book
    // ---------------------------------------------------------------------

    struct Offer {
        address bidder; // who placed the bid
        uint256 pricePerItem; // gross WETH per piece (fees + royalty come out of this)
        address piece; // specific piece, or address(0) for a collection-wide offer
        uint64 expiry; // unix time after which the offer is dead; 0 = no expiry
        uint32 quantity; // number of pieces sought (always 1 for a specific-piece offer)
        uint32 filled; // number already sold
        bool cancelled; // true once the bidder cancels
    }

    uint256 public nextOfferId;
    mapping(uint256 => Offer) public offers;

    /// @notice Funds that could not be pushed to a recipient during accept, claimable via `claim`.
    mapping(address => uint256) public rescue;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event OfferCreated(
        uint256 indexed id,
        address indexed bidder,
        address indexed piece,
        uint256 pricePerItem,
        uint32 quantity,
        uint64 expiry,
        bool collectionWide
    );
    event OfferCancelled(uint256 indexed id, address indexed bidder);
    event OfferAccepted(
        uint256 indexed id,
        address indexed piece,
        address indexed seller,
        address bidder,
        uint256 pricePerItem,
        uint256 sellerProceeds,
        uint256 royalty,
        uint256 fee,
        uint32 filled,
        uint32 quantity
    );

    event FeeBpsUpdated(uint96 oldValue, uint96 newValue);
    event RoyaltyBpsUpdated(uint96 oldValue, uint96 newValue);
    event FeeRecipientUpdated(address oldValue, address newValue);
    event RoyaltyReceiverOverrideUpdated(address oldValue, address newValue);
    event Claimed(address indexed account, uint256 amount);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error ZeroAddress();
    error ZeroAmount();
    error InvalidQuantity();
    error BpsTooHigh();
    error NotArtificialPiece();
    error OfferNotActive();
    error OfferExpired();
    error WrongPiece();
    error NotPieceOwner();
    error NotListedForSale();
    error TransferFailed();
    error ProceedsUnderflow();
    error NothingToClaim();
    error NotBidder();

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    /// @param _royaltyReceiver Where the artist royalty is paid. Pass address(0) to use the
    ///        collection's on-chain artist (`genesis.artist()`); pass an address to override it.
    ///        Changeable later via `setRoyaltyReceiverOverride`.
    constructor(
        address _weth,
        address _genesis,
        address _feeRecipient,
        uint96 _feeBps,
        uint96 _royaltyBps,
        address _royaltyReceiver,
        address _admin
    ) Ownable(_admin) {
        if (_weth == address(0) || _genesis == address(0) || _feeRecipient == address(0)) {
            revert ZeroAddress();
        }
        if (uint256(_feeBps) + uint256(_royaltyBps) > MAX_TOTAL_BPS) revert BpsTooHigh();

        weth = IWETH(_weth);
        genesis = IArtificialGenesis(_genesis);
        feeRecipient = _feeRecipient;
        feeBps = _feeBps;
        royaltyBps = _royaltyBps;
        royaltyReceiverOverride = _royaltyReceiver;
    }

    // ---------------------------------------------------------------------
    // Bidder actions
    // ---------------------------------------------------------------------

    /// @notice Place a standing offer. `piece == address(0)` makes it a collection-wide offer for
    ///         `quantity` pieces at `pricePerItem` each; any owner of any valid piece may accept
    ///         (once per fill) until it is fully filled. A specific-piece offer must have
    ///         quantity 1. Funds are NOT escrowed — the bid is backed by the bidder's WETH
    ///         balance + allowance, checked again at accept time.
    /// @return id The new offer id.
    function createOffer(address piece, uint256 pricePerItem, uint32 quantity, uint64 expiry)
        external
        whenNotPaused
        returns (uint256 id)
    {
        if (pricePerItem == 0) revert ZeroAmount();
        if (quantity == 0) revert InvalidQuantity();
        if (piece != address(0)) {
            if (!genesis.isArtificial(piece)) revert NotArtificialPiece();
            if (quantity != 1) revert InvalidQuantity(); // a specific piece is unique
        }
        _sellerProceeds(pricePerItem); // reverts if fees would exceed the price

        id = nextOfferId++;
        offers[id] = Offer({
            bidder: msg.sender,
            pricePerItem: pricePerItem,
            piece: piece,
            expiry: expiry,
            quantity: quantity,
            filled: 0,
            cancelled: false
        });

        emit OfferCreated(id, msg.sender, piece, pricePerItem, quantity, expiry, piece == address(0));
    }

    /// @notice Cancel one of your offers (stops any remaining fills).
    function cancelOffer(uint256 id) external {
        Offer storage o = offers[id];
        if (o.cancelled || o.filled >= o.quantity) revert OfferNotActive();
        if (o.bidder != msg.sender) revert NotBidder();
        o.cancelled = true;
        emit OfferCancelled(id, msg.sender);
    }

    // ---------------------------------------------------------------------
    // Owner accept
    // ---------------------------------------------------------------------

    /// @notice Accept an offer with a piece you own. You MUST have listed the piece at exactly
    ///         `sellerProceeds(id)` via the piece's `listForSale` first. Settlement runs through
    ///         the piece's own `buyNow`: you are credited the sale price (claim it via the piece's
    ///         `withdraw`), the artist is paid the royalty, the platform the fee, and the piece is
    ///         transferred to the bidder — atomically, or the whole call reverts and you keep it.
    /// @param id The offer id.
    /// @param piece The piece being sold. For a specific-piece offer it must equal the offer's
    ///        target; for a collection-wide offer it must be a genuine AAA piece you own.
    function acceptOffer(uint256 id, address piece) external nonReentrant whenNotPaused {
        Offer storage o = offers[id];
        if (o.cancelled || o.filled >= o.quantity) revert OfferNotActive();
        if (o.expiry != 0 && block.timestamp > o.expiry) revert OfferExpired();

        if (o.piece == address(0)) {
            if (!genesis.isArtificial(piece)) revert NotArtificialPiece();
        } else if (o.piece != piece) {
            revert WrongPiece();
        }

        IArtificial art = IArtificial(piece);
        address seller = art.owner();
        if (seller != msg.sender) revert NotPieceOwner();

        uint256 price = o.pricePerItem;
        (uint256 sellerAmount, uint256 royalty, uint256 fee) = _split(price);

        // The piece must be listed; `currentOffer()` is a for-sale flag (not the price). The exact
        // price is enforced by `buyNow` below, which reverts unless the owner listed at exactly
        // `sellerAmount`. This keeps the sale atomic and owner-safe.
        if (art.currentOffer() == 0) revert NotListedForSale();

        // Effects: record this fill before any external interaction.
        o.filled += 1;
        address bidder = o.bidder;

        // Interactions.
        // 1. Pull one item's price in WETH; reverts if the bidder lacks balance/allowance, in
        //    which case the seller simply cannot accept and keeps the piece.
        _pullWeth(bidder, price);
        // 2. Unwrap to native ETH.
        weth.withdraw(price);
        // 3. Settle through the piece's own sale (pays the seller, makes this contract the owner).
        art.buyNow{ value: sellerAmount }();
        // 4. Forward the piece to the winning bidder.
        art.transferOwnership(bidder);
        // Defense-in-depth: the bidder's WETH was pulled only in exchange for real ownership.
        if (art.owner() != bidder) revert TransferFailed();
        // 5. Pay artist royalty and platform fee (credited on push-failure, never reverting).
        _pay(_royaltyReceiver(), royalty);
        _pay(feeRecipient, fee);

        emit OfferAccepted(id, piece, seller, bidder, price, sellerAmount, royalty, fee, o.filled, o.quantity);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice Pieces still available to sell into offer `id` (0 if cancelled/expired/filled).
    function remaining(uint256 id) public view returns (uint32) {
        Offer memory o = offers[id];
        if (o.cancelled || o.filled >= o.quantity) return 0;
        if (o.expiry != 0 && block.timestamp > o.expiry) return 0;
        return o.quantity - o.filled;
    }

    /// @notice The exact price the owner must list a piece at to accept offer `id`.
    function sellerProceeds(uint256 id) external view returns (uint256) {
        return _sellerProceeds(offers[id].pricePerItem);
    }

    /// @notice Split a per-item price into (sellerProceeds, royalty, fee).
    function quote(uint256 price)
        external
        view
        returns (uint256 sellerProceeds_, uint256 royalty, uint256 fee)
    {
        return _split(price);
    }

    /// @notice Whether offer `id` can currently be filled by `piece` (has remaining, unexpired,
    ///         eligible piece, and the bidder has enough WETH balance + allowance for one item).
    function isOfferFulfillable(uint256 id, address piece) external view returns (bool) {
        if (remaining(id) == 0) return false;
        Offer memory o = offers[id];
        if (o.piece == address(0)) {
            if (!genesis.isArtificial(piece)) return false;
        } else if (o.piece != piece) {
            return false;
        }
        if (weth.balanceOf(o.bidder) < o.pricePerItem) return false;
        if (weth.allowance(o.bidder, address(this)) < o.pricePerItem) return false;
        return true;
    }

    /// @notice The current royalty recipient (override if set, else the collection artist).
    function royaltyReceiver() external view returns (address) {
        return _royaltyReceiver();
    }

    // ---------------------------------------------------------------------
    // Rescue / claim
    // ---------------------------------------------------------------------

    /// @notice Withdraw funds credited to you that could not be pushed during an accept.
    function claim() external nonReentrant {
        uint256 amount = rescue[msg.sender];
        if (amount == 0) revert NothingToClaim();
        rescue[msg.sender] = 0;
        (bool ok,) = msg.sender.call{ value: amount }("");
        if (!ok) {
            rescue[msg.sender] = amount;
            revert NothingToClaim();
        }
        emit Claimed(msg.sender, amount);
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    function setFeeBps(uint96 newFeeBps) external onlyOwner {
        if (uint256(newFeeBps) + uint256(royaltyBps) > MAX_TOTAL_BPS) revert BpsTooHigh();
        emit FeeBpsUpdated(feeBps, newFeeBps);
        feeBps = newFeeBps;
    }

    function setRoyaltyBps(uint96 newRoyaltyBps) external onlyOwner {
        if (uint256(feeBps) + uint256(newRoyaltyBps) > MAX_TOTAL_BPS) revert BpsTooHigh();
        emit RoyaltyBpsUpdated(royaltyBps, newRoyaltyBps);
        royaltyBps = newRoyaltyBps;
    }

    function setFeeRecipient(address newFeeRecipient) external onlyOwner {
        if (newFeeRecipient == address(0)) revert ZeroAddress();
        emit FeeRecipientUpdated(feeRecipient, newFeeRecipient);
        feeRecipient = newFeeRecipient;
    }

    /// @param newOverride Set to address(0) to fall back to `genesis.artist()`.
    function setRoyaltyReceiverOverride(address newOverride) external onlyOwner {
        emit RoyaltyReceiverOverrideUpdated(royaltyReceiverOverride, newOverride);
        royaltyReceiverOverride = newOverride;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    function _split(uint256 price)
        internal
        view
        returns (uint256 sellerProceeds_, uint256 royalty, uint256 fee)
    {
        royalty = (price * royaltyBps) / BPS_DENOMINATOR;
        fee = (price * feeBps) / BPS_DENOMINATOR;
        if (royalty + fee >= price) revert ProceedsUnderflow();
        sellerProceeds_ = price - royalty - fee;
    }

    function _sellerProceeds(uint256 price) internal view returns (uint256 s) {
        (s,,) = _split(price);
    }

    function _royaltyReceiver() internal view returns (address) {
        address ov = royaltyReceiverOverride;
        return ov != address(0) ? ov : genesis.artist();
    }

    function _pullWeth(address from, uint256 amount) internal {
        bool ok = weth.transferFrom(from, address(this), amount);
        require(ok, "WETH transferFrom failed");
    }

    /// @dev Push `amount` ETH to `to`; on failure, credit it for later `claim` instead of
    ///      reverting the whole accept (so a hostile fee/royalty recipient cannot brick sales).
    function _pay(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok,) = to.call{ value: amount, gas: 30_000 }("");
        if (!ok) {
            rescue[to] += amount;
        }
    }

    /// @notice Accept native ETH (from `weth.withdraw`).
    receive() external payable { }
}
