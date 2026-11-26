// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CallRegistry, IMultiFeed} from "../src/CallRegistry.sol";

contract MockMultiFeed is IMultiFeed {
    uint80 public price = 552e8;
    uint48 public onchainTs;
    uint8 private _decimals = 18;
    bool private _openRead = true;
    bool private _neverUpdated;

    constructor() {
        onchainTs = uint48(block.timestamp);
    }

    function set(uint80 p, uint48 ts) external {
        price = p;
        onchainTs = ts;
    }

    function setOpenRead(bool v) external {
        _openRead = v;
    }

    function setNeverUpdated() external {
        _neverUpdated = true;
    }

    function fetch(bytes4) external view returns (PriceSnapshot memory) {
        if (_neverUpdated) return PriceSnapshot(0, 0, 0);
        return PriceSnapshot(price, onchainTs, onchainTs);
    }

    function decimals() external view returns (uint8) {
        return _decimals;
    }

    function description() external pure returns (string memory) {
        return "MockMultiFeed";
    }

    function contractType() external pure returns (uint256) {
        return 2;
    }

    function isOpenRead() external view returns (bool) {
        return _openRead;
    }
}

contract CallRegistryTest is Test {
    MockMultiFeed feed;
    CallRegistry registry; // verified mode (mainnet)
    CallRegistry refRegistry; // referenced mode (testnet)

    bytes4 constant FEED_ID = 0x0000048c;
    bytes32 constant KOL = keccak256("someone");

    function setUp() public {
        vm.warp(1_800_000_000);
        feed = new MockMultiFeed();
        registry = new CallRegistry(address(feed), FEED_ID);
        refRegistry = new CallRegistry(address(0), bytes4(0));
    }

    function _record(CallRegistry r, uint64 deadline) internal returns (uint256) {
        return r.recordCall(keccak256("post"), KOL, "BNB", 1, 600e18, deadline, 2000, 552e18, 1 hours);
    }

    function _referenced(CallRegistry r, uint64 deadline) internal returns (uint256) {
        return r.recordCallReferenced(keccak256("post"), KOL, "BNB", 1, 600e18, deadline, 2000, 552e18, 552e8, uint48(block.timestamp), 64_000_000);
    }

    function test_ReadsDecimalsFromFeed() public view {
        assertEq(registry.atlasDecimals(), 18);
        assertTrue(registry.readsFeed());
    }

    function test_RevertsOnWhitelistOnlyFeed() public {
        feed.setOpenRead(false);
        vm.expectRevert(CallRegistry.FeedNotOpenRead.selector);
        new CallRegistry(address(feed), FEED_ID);
    }

    function test_RecordsAtlasPriceFromFeedNotCaller() public {
        uint256 id = _record(registry, uint64(block.timestamp + 7 days));
        CallRegistry.Call memory c = registry.getCall(id);
        assertEq(c.atlasPrice, 552e8, "atlas price must come from the feed");
        assertEq(c.cmcPrice, 552e18, "cmc price is caller-supplied");
        assertEq(c.cournotBps, 2000);
        assertTrue(c.atlasVerified, "a feed read is verified");
        assertFalse(c.resolved);
    }

    function test_RevertsOnStaleAtlasPrice() public {
        feed.set(552e8, uint48(block.timestamp - 2 hours));
        vm.expectRevert(abi.encodeWithSelector(CallRegistry.StaleAtlasPrice.selector, block.timestamp - 2 hours));
        _record(registry, uint64(block.timestamp + 7 days));
    }

    function test_RevertsOnNeverUpdatedFeed() public {
        feed.setNeverUpdated();
        vm.expectRevert(CallRegistry.FeedNeverUpdated.selector);
        _record(registry, uint64(block.timestamp + 7 days));
    }

    function test_ReferencedModeRecordsSuppliedPriceAndBlock() public {
        uint256 id = _referenced(refRegistry, uint64(block.timestamp + 7 days));
        CallRegistry.Call memory c = refRegistry.getCall(id);
        assertEq(c.atlasPrice, 552e8);
        assertEq(c.atlasRefBlock, 64_000_000, "the mainnet block must be stored so the price is checkable");
        assertFalse(c.atlasVerified, "a referenced price is never presented as verified");
        assertEq(refRegistry.atlasDecimals(), 0);
    }

    function test_ModesRefuseEachOthersCall() public {
        uint64 deadline = uint64(block.timestamp + 7 days);
        vm.expectRevert(CallRegistry.FeedNotConfigured.selector);
        _record(refRegistry, deadline);
        vm.expectRevert(CallRegistry.FeedAlreadyConfigured.selector);
        _referenced(registry, deadline);
    }

    function test_CannotResolveBeforeDeadline() public {
        uint64 deadline = uint64(block.timestamp + 7 days);
        uint256 id = _record(registry, deadline);
        vm.expectRevert(abi.encodeWithSelector(CallRegistry.NotYetDue.selector, deadline));
        registry.resolveCall(id, true, 600e18);
    }

    function test_ResolvesAfterDeadlineAndCannotResolveTwice() public {
        uint64 deadline = uint64(block.timestamp + 7 days);
        uint256 id = _record(registry, deadline);
        vm.warp(deadline + 1);
        registry.resolveCall(id, true, 600e18);
        assertTrue(registry.getCall(id).hit);
        vm.expectRevert(CallRegistry.AlreadyResolved.selector);
        registry.resolveCall(id, false, 600e18);
    }

    function test_PreflightExposesFeedState() public view {
        (bool openRead, uint80 price, uint48 ts) = registry.preflight();
        assertTrue(openRead);
        assertEq(price, 552e8);
        assertEq(ts, uint48(block.timestamp));
    }
}
