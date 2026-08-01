// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IWETH
/// @notice Minimal Wrapped Ether interface (mainnet: 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2).
interface IWETH {
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function deposit() external payable;
    function withdraw(uint256 amount) external;
}
