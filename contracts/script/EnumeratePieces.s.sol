// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console2 } from "forge-std/Script.sol";
import { IArtificialGenesis } from "../src/interfaces/IArtificialGenesis.sol";

/// @notice Enumerates all pieces of the collection by walking the genesis contract's CREATE
///         addresses (nonce 1..N) and keeping those that `isArtificial`. Writes a JSON array.
///         Run against mainnet (or a mainnet fork): forge script script/EnumeratePieces.s.sol --rpc-url <url>
contract EnumeratePieces is Script {
    address constant GENESIS = 0xa7a3022249415e25752C4cF8696c2418DEfdF2Db;

    function run() external {
        IArtificialGenesis gen = IArtificialGenesis(GENESIS);
        uint256 total = gen.thisMany();
        string memory json = "[";
        uint256 count = 0;
        // Scan a generous nonce range to tolerate any non-piece CREATEs by the genesis.
        for (uint64 nonce = 1; nonce <= 512 && count < total; nonce++) {
            address a = vm.computeCreateAddress(GENESIS, nonce);
            if (gen.isArtificial(a)) {
                if (count > 0) json = string.concat(json, ",");
                json = string.concat(json, "\"", vm.toString(a), "\"");
                count++;
            }
        }
        json = string.concat(json, "]");
        vm.writeFile("pieces.json", json);
        console2.log("total expected:", total);
        console2.log("found:", count);
    }
}
