// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Batcher
/// @notice Minimal EIP-7702 batch executor. An EOA delegates its code to this implementation and
///         calls `execute` on ITSELF, so a list+accept can run atomically in a single transaction
///         with `msg.sender` still equal to the EOA for each sub-call. Used by the demo wallet; in
///         production the user's own smart/7702 wallet provides the equivalent via `wallet_sendCalls`.
contract Batcher {
    struct Call {
        address to;
        uint256 value;
        bytes data;
    }

    error NotSelf();
    error CallFailed(uint256 index);

    /// @dev Only the account itself (running this as delegated code) may invoke a batch.
    function execute(Call[] calldata calls) external payable {
        if (msg.sender != address(this)) revert NotSelf();
        for (uint256 i; i < calls.length; i++) {
            (bool ok,) = calls[i].to.call{ value: calls[i].value }(calls[i].data);
            if (!ok) revert CallFailed(i);
        }
    }

    receive() external payable { }
}
