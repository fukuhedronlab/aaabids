// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IArtificial
/// @notice Minimal interface for a single "Artificial After All" piece contract.
/// @dev Each piece is its own contract with an OpenZeppelin-style `Ownable` owner.
///      Ownership changes ONLY via `transferOwnership` (owner-only), and the only
///      paid sale primitive is `buyNow`, which credits 100% of msg.value to the
///      seller's `pendingWithdrawals` and then sets the new owner to msg.sender.
///      There is no ERC-721 approval/transferFrom and no built-in secondary royalty.
interface IArtificial {
    /// @notice Current Ownable owner of the piece (the seller, before a sale).
    function owner() external view returns (address);

    /// @notice For-sale flag: nonzero (1) when the piece is currently listed, 0 otherwise.
    /// @dev NOT the price. The listing price lives in the piece's storage and is only
    ///      enforced inside `buyNow` (msg.value must equal it), never exposed as a getter.
    function currentOffer() external view returns (uint256);

    /// @notice List the piece for sale at `price` wei. Owner-only. Does NOT move the piece.
    function listForSale(uint256 price) external;

    /// @notice Remove an active listing. Owner-only.
    function cancelFromSale() external;

    /// @notice Buy the listed piece. Requires msg.value == currentOffer() and that it is for sale.
    ///         Credits msg.value to the seller's pendingWithdrawals and makes msg.sender the owner.
    function buyNow() external payable;

    /// @notice Transfer Ownable ownership to `newOwner`. Owner-only. No payment occurs.
    function transferOwnership(address newOwner) external;

    /// @notice Withdraw accrued sale proceeds (pull-payment) to the caller.
    function withdraw() external;

    /// @notice Proceeds owed to `account` from prior sales, claimable via withdraw().
    function pendingWithdrawals(address account) external view returns (uint256);

    /// @notice The genesis/registry contract this piece descends from.
    function parent() external view returns (address);
}
