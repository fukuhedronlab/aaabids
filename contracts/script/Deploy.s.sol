// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console2 } from "forge-std/Script.sol";
import { AAAbids } from "../src/AAAbids.sol";

/// @notice Deploys AAAbids. All parameters are read from env with mainnet defaults, and
///         every one of them is also changeable post-deploy by the admin (see the contract's
///         setter functions, callable from Etherscan's "Write Contract" tab once verified).
///
/// Usage (dry run):
///   forge script script/Deploy.s.sol --rpc-url $MAINNET_RPC_URL
/// Broadcast + verify:
///   forge script script/Deploy.s.sol --rpc-url $MAINNET_RPC_URL --broadcast --verify
contract Deploy is Script {
    // Mainnet defaults.
    address constant DEFAULT_WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address constant DEFAULT_GENESIS = 0xa7a3022249415e25752C4cF8696c2418DEfdF2Db;

    function run() external returns (AAAbids bids) {
        address weth = vm.envOr("WETH", DEFAULT_WETH);
        address genesis = vm.envOr("GENESIS", DEFAULT_GENESIS);
        // Fee recipient + admin default to the broadcaster if unset.
        address broadcaster = msg.sender;
        address feeRecipient = vm.envOr("FEE_RECIPIENT", broadcaster);
        address admin = vm.envOr("ADMIN", broadcaster);
        uint96 feeBps = uint96(vm.envOr("FEE_BPS", uint256(250))); // 2.5%
        uint96 royaltyBps = uint96(vm.envOr("ROYALTY_BPS", uint256(500))); // 5%
        // Royalty receiver: address(0) => uses the collection's on-chain artist (genesis.artist()).
        address royaltyReceiver = vm.envOr("ROYALTY_RECEIVER", address(0));

        vm.startBroadcast();
        bids = new AAAbids(weth, genesis, feeRecipient, feeBps, royaltyBps, royaltyReceiver, admin);
        vm.stopBroadcast();

        console2.log("AAAbids deployed at:", address(bids));
        console2.log("  weth:           ", weth);
        console2.log("  genesis:        ", genesis);
        console2.log("  feeRecipient:   ", feeRecipient);
        console2.log("  royaltyReceiver:", royaltyReceiver);
        console2.log("  admin:          ", admin);
        console2.log("  feeBps:         ", feeBps);
        console2.log("  royaltyBps:     ", royaltyBps);
    }
}
