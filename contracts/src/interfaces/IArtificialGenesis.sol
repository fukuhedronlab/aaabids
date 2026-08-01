// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IArtificialGenesis
/// @notice Interface for the AAA genesis/registry contract
///         (mainnet: 0xa7a3022249415e25752c4cf8696c2418defdf2db).
/// @dev Used as the canonical on-chain source of truth for collection membership
///      (`isArtificial`) and the artist royalty recipient (`artist`).
interface IArtificialGenesis {
    /// @notice Returns true iff `addr` is a genuine Artificial After All piece contract.
    function isArtificial(address addr) external view returns (bool);

    /// @notice The collection artist address (default royalty recipient).
    function artist() external view returns (address);

    /// @notice Total supply of pieces (256).
    function thisMany() external view returns (uint256);

    /// @notice Primary mint price in wei.
    function thisMuch() external view returns (uint256);
}
