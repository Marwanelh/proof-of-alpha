// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {CallRegistry} from "../src/CallRegistry.sol";

/// @notice Deploy the registry on the SAME chain as the Atlas feed you read.
///   mainnet : forge script script/Deploy.s.sol --rpc-url $BSC_MAINNET_RPC --broadcast
///   testnet : ATLAS_FEED_ADDRESS=$TESTNET_FEED forge script script/Deploy.s.sol --rpc-url $BSC_TESTNET_RPC --broadcast
contract Deploy is Script {
    function run() external returns (CallRegistry registry) {
        address feed = vm.envAddress("ATLAS_FEED_ADDRESS");
        bytes4 feedId = bytes4(vm.envBytes32("ATLAS_FEED_ID"));
        vm.startBroadcast();
        registry = new CallRegistry(feed, feedId);
        vm.stopBroadcast();
        console.log("CallRegistry", address(registry));
        console.log("Atlas feed  ", feed);
        console.log("decimals    ", registry.atlasDecimals());
        (, uint80 price, uint48 ts) = registry.preflight();
        console.log("feed price  ", price);
        console.log("feed age (s)", block.timestamp - ts);
    }
}
