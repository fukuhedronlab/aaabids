// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test, console2 } from "forge-std/Test.sol";
import { AAAbids } from "../src/AAAbids.sol";
import { IArtificial } from "../src/interfaces/IArtificial.sol";
import { IArtificialGenesis } from "../src/interfaces/IArtificialGenesis.sol";
import { IWETH } from "../src/interfaces/IWETH.sol";

/// @notice End-to-end tests against a mainnet fork using the real "Artificial After All"
///         collection. Verifies accepted bids transfer the piece, pay the seller, pay the artist a
///         royalty and the platform a fee, support multi-quantity collection offers, and that an
///         owner can never lose a piece when settlement cannot complete.
contract AAAbidsForkTest is Test {
    address constant PIECE = 0xbDF5A7F5e5AE18eE580139297C63a89fc1d18B5f; // piece #1
    address constant PIECE2 = 0x95c5a726059A533A35C9ceB53057685dfC2Eb8cb; // piece #2
    address constant GENESIS = 0xa7a3022249415e25752C4cF8696c2418DEfdF2Db;
    address constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address constant ARTIST = 0x9d61dF64ad9d952A363c2aaDf678F33bA66E2a6f;

    AAAbids bids;
    IArtificial art = IArtificial(PIECE);
    IArtificialGenesis gen = IArtificialGenesis(GENESIS);
    IWETH weth = IWETH(WETH);

    address platform = makeAddr("platform");
    address admin = makeAddr("admin");
    address seller = makeAddr("seller");
    address seller2 = makeAddr("seller2");
    address bidder = makeAddr("bidder");

    uint96 constant FEE_BPS = 250; // 2.5%
    uint96 constant ROYALTY_BPS = 500; // 5%

    function setUp() public {
        string memory rpc = vm.envOr("MAINNET_RPC_URL", string("https://ethereum-rpc.publicnode.com"));
        vm.createSelectFork(rpc);
        // royaltyReceiver = address(0) => defaults to the collection's on-chain artist.
        bids = new AAAbids(WETH, GENESIS, platform, FEE_BPS, ROYALTY_BPS, address(0), admin);

        // Move piece #1 to a fresh seller distinct from the artist.
        vm.prank(art.owner());
        art.transferOwnership(seller);
        assertEq(art.owner(), seller, "setup: seller should own piece #1");
    }

    function _fundBidder(uint256 amount) internal {
        vm.deal(bidder, amount);
        vm.startPrank(bidder);
        weth.deposit{ value: amount }();
        weth.approve(address(bids), type(uint256).max);
        vm.stopPrank();
    }

    function _accept(address who, address piece, uint256 id, uint256 listAt) internal {
        vm.startPrank(who);
        IArtificial(piece).listForSale(listAt);
        bids.acceptOffer(id, piece);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------
    function test_CollectionFacts() public view {
        assertTrue(gen.isArtificial(PIECE));
        assertTrue(gen.isArtificial(PIECE2));
        assertFalse(gen.isArtificial(address(0xdead)));
        assertEq(gen.artist(), ARTIST);
        assertEq(gen.thisMany(), 256);
    }

    function test_AcceptPieceOffer_PaysEveryone_AndTransfers() public {
        uint256 price = 1 ether;
        _fundBidder(price);
        vm.prank(bidder);
        uint256 id = bids.createOffer(PIECE, price, 1, 0);

        (uint256 sellerAmount, uint256 royalty, uint256 fee) = bids.quote(price);
        assertEq(royalty, 0.05 ether);
        assertEq(fee, 0.025 ether);
        assertEq(sellerAmount, 0.925 ether);

        uint256 artistBefore = ARTIST.balance;
        uint256 platformBefore = platform.balance;

        _accept(seller, PIECE, id, sellerAmount);

        assertEq(art.owner(), bidder, "bidder should own the piece");
        assertEq(art.pendingWithdrawals(seller), sellerAmount, "seller not credited");
        assertEq(ARTIST.balance - artistBefore, royalty, "artist royalty wrong");
        assertEq(platform.balance - platformBefore, fee, "platform fee wrong");
        assertEq(weth.balanceOf(bidder), 0, "bidder WETH not fully spent");
        assertEq(bids.remaining(id), 0, "offer should be fully filled");
    }

    // A collection-wide offer for quantity 2, filled by two different pieces / sellers.
    function test_CollectionOffer_QuantityTwo_FilledByTwoPieces() public {
        uint256 price = 1 ether;
        _fundBidder(2 * price);

        // Put piece #2 in a second seller's hands.
        vm.prank(IArtificial(PIECE2).owner());
        IArtificial(PIECE2).transferOwnership(seller2);

        vm.prank(bidder);
        uint256 id = bids.createOffer(address(0), price, 2, 0); // want 2 of any piece
        assertEq(bids.remaining(id), 2);

        uint256 sellerAmount = bids.sellerProceeds(id);

        _accept(seller, PIECE, id, sellerAmount); // fill #1 with piece #1
        assertEq(art.owner(), bidder);
        assertEq(bids.remaining(id), 1, "one fill left");

        _accept(seller2, PIECE2, id, sellerAmount); // fill #2 with piece #2
        assertEq(IArtificial(PIECE2).owner(), bidder);
        assertEq(bids.remaining(id), 0, "offer fully filled");

        // A third attempt fails — nothing left.
        vm.prank(seller);
        vm.expectRevert(AAAbids.OfferNotActive.selector);
        bids.acceptOffer(id, PIECE);

        assertEq(weth.balanceOf(bidder), 0, "bidder spent exactly 2x price");
    }

    function test_SpecificPieceOffer_MustHaveQuantityOne() public {
        vm.prank(bidder);
        vm.expectRevert(AAAbids.InvalidQuantity.selector);
        bids.createOffer(PIECE, 1 ether, 2, 0);
    }

    function test_OwnerKeepsPiece_WhenBidderCannotPay() public {
        uint256 price = 1 ether;
        _fundBidder(price);
        vm.prank(bidder);
        uint256 id = bids.createOffer(PIECE, price, 1, 0);
        uint256 sellerAmount = bids.sellerProceeds(id);

        vm.prank(bidder);
        weth.approve(address(bids), 0); // revoke

        vm.startPrank(seller);
        art.listForSale(sellerAmount);
        vm.expectRevert();
        bids.acceptOffer(id, PIECE);
        vm.stopPrank();

        assertEq(art.owner(), seller, "seller must still own the piece");
    }

    function test_CannotDrainBidder_WithFakePiece() public {
        uint256 price = 1 ether;
        _fundBidder(price);
        vm.prank(bidder);
        uint256 id = bids.createOffer(address(0), price, 1, 0);

        FakePiece fake = new FakePiece(address(this));
        vm.expectRevert(AAAbids.NotArtificialPiece.selector);
        bids.acceptOffer(id, address(fake));

        assertEq(weth.balanceOf(bidder), price, "bidder WETH must be untouched");
    }

    function test_WrongListingPriceReverts() public {
        uint256 price = 1 ether;
        _fundBidder(price);
        vm.prank(bidder);
        uint256 id = bids.createOffer(PIECE, price, 1, 0);
        uint256 sellerAmount = bids.sellerProceeds(id);

        vm.startPrank(seller);
        art.listForSale(sellerAmount + 1);
        vm.expectRevert(); // buyNow's InsufficientFunds()
        bids.acceptOffer(id, PIECE);
        vm.stopPrank();
        assertEq(art.owner(), seller);
    }

    function test_NotListedReverts() public {
        _fundBidder(1 ether);
        vm.prank(bidder);
        uint256 id = bids.createOffer(PIECE, 1 ether, 1, 0);
        vm.prank(seller);
        vm.expectRevert(AAAbids.NotListedForSale.selector);
        bids.acceptOffer(id, PIECE);
    }

    function test_NonOwnerCannotAccept() public {
        _fundBidder(1 ether);
        vm.prank(bidder);
        uint256 id = bids.createOffer(PIECE, 1 ether, 1, 0);
        uint256 sellerAmount = bids.sellerProceeds(id);
        vm.prank(seller);
        art.listForSale(sellerAmount);
        vm.prank(address(0xBEEF));
        vm.expectRevert(AAAbids.NotPieceOwner.selector);
        bids.acceptOffer(id, PIECE);
    }

    function test_CancelOffer() public {
        vm.prank(bidder);
        uint256 id = bids.createOffer(PIECE, 1 ether, 1, 0);
        vm.prank(bidder);
        bids.cancelOffer(id);
        assertEq(bids.remaining(id), 0);
    }

    function test_ExpiredOfferReverts() public {
        _fundBidder(1 ether);
        uint64 expiry = uint64(block.timestamp + 1 hours);
        vm.prank(bidder);
        uint256 id = bids.createOffer(PIECE, 1 ether, 1, expiry);
        uint256 sellerAmount = bids.sellerProceeds(id);
        vm.warp(block.timestamp + 2 hours);
        vm.startPrank(seller);
        art.listForSale(sellerAmount);
        vm.expectRevert(AAAbids.OfferExpired.selector);
        bids.acceptOffer(id, PIECE);
        vm.stopPrank();
    }

    function test_IsOfferFulfillable_TracksAllowance() public {
        _fundBidder(1 ether);
        vm.prank(bidder);
        uint256 id = bids.createOffer(PIECE, 1 ether, 1, 0);
        assertTrue(bids.isOfferFulfillable(id, PIECE));
        vm.prank(bidder);
        weth.approve(address(bids), 0);
        assertFalse(bids.isOfferFulfillable(id, PIECE));
    }

    function test_AdminCanSetFeesWithinCap() public {
        vm.prank(admin);
        bids.setFeeBps(1000);
        assertEq(bids.feeBps(), 1000);
        vm.prank(admin);
        vm.expectRevert(AAAbids.BpsTooHigh.selector);
        bids.setRoyaltyBps(2001);
    }

    function test_NonAdminCannotSetFees() public {
        vm.expectRevert();
        bids.setFeeBps(100);
    }

    function test_ConstructorRoyaltyReceiver() public {
        // Deploying with a specific royalty receiver sets it up front (no follow-up tx needed).
        address artistWallet = makeAddr("artistWallet");
        AAAbids b = new AAAbids(WETH, GENESIS, platform, FEE_BPS, ROYALTY_BPS, artistWallet, admin);
        assertEq(b.royaltyReceiver(), artistWallet, "constructor royalty receiver ignored");
        // address(0) falls back to the collection artist.
        AAAbids b0 = new AAAbids(WETH, GENESIS, platform, FEE_BPS, ROYALTY_BPS, address(0), admin);
        assertEq(b0.royaltyReceiver(), ARTIST, "zero should fall back to genesis artist");
    }

    function test_RoyaltyOverride() public {
        address newArtist = makeAddr("newArtist");
        vm.prank(admin);
        bids.setRoyaltyReceiverOverride(newArtist);
        assertEq(bids.royaltyReceiver(), newArtist);
        vm.prank(admin);
        bids.setRoyaltyReceiverOverride(address(0));
        assertEq(bids.royaltyReceiver(), ARTIST);
    }
}

/// A well-formed impostor implementing the piece interface but doing nothing on sale/transfer.
contract FakePiece {
    address public owner;

    constructor(address o) {
        owner = o;
    }

    function currentOffer() external pure returns (uint256) {
        return 1;
    }

    function listForSale(uint256) external { }
    function buyNow() external payable { }
    function transferOwnership(address) external { }
}
