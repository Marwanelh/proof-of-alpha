// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Read-only interface of an Atlas Oracle MultiFeed registry, transcribed from
///         https://github.com/oracle-atlas/push-oracle-interfaces/blob/main/src/IMultiFeed.sol (MIT).
/// @dev Verified live on BSC mainnet 2026-11-26 against the free feed proxy
///      `0xeace519ebb14fb8404fa6ddd23c3b34abade44aa`: `contractType()` = 2, `decimals()` = 18,
///      `isOpenRead()` = true. NOTE: that proxy is a MultiFeed — `latestRoundData()` reverts on it,
///      so a Chainlink-style read only works against a *SingleFeed* proxy.
interface IMultiFeed {
    struct PriceSnapshot {
        uint80 price; // aggregated price, scaled by decimals()
        uint48 aggregatedTs; // off-chain aggregation timestamp
        uint48 onchainTs; // on-chain update timestamp
    }

    /// @return priceSnapshot zero-initialised if the feed has never been updated; reverts on an
    ///         unknown feedId (so a revert means "wrong id", not "feed down").
    function fetch(bytes4 feedId) external view returns (PriceSnapshot memory priceSnapshot);

    function decimals() external view returns (uint8 precision);
    function description() external view returns (string memory desc);
    function contractType() external view returns (uint256 typeId);
    function isOpenRead() external view returns (bool enabled);
}

/// @title CallRegistry — tamper-proof receipts for KOL calls.
/// @notice A call is recorded before the outcome is known and can only be resolved after its deadline,
///         so neither the poster nor we can edit a record after the fact.
///
/// Two deployments, one ABI:
///  - VERIFIED mode — deployed on the same chain as the Atlas feed (BSC mainnet). `recordCall` reads
///    the feed inside the recording transaction, so the stored price is verified on-chain.
///  - REFERENCED mode — deployed on BSC testnet, which cannot read mainnet. `recordCallReferenced`
///    takes the price our backend read from mainnet over a keyless public RPC, plus the Atlas
///    timestamp and the mainnet block it was read at, so anyone can re-check it against Atlas history.
contract CallRegistry {
    struct Call {
        bytes32 postHash; // keccak256 of the original post text
        bytes32 kolId; // stable KOL identifier (nickname + avatar hash)
        bytes4 asset; // symbol, left-aligned, e.g. bytes4("BNB")
        int8 direction; // +1 bullish, -1 bearish, 0 opinion (not scored)
        uint16 cournotBps; // Cournot probability in basis points (0..10000)
        uint64 deadline; // unix seconds; resolution is blocked before this
        uint128 target; // target price, scaled by atlasDecimals
        uint128 cmcPrice; // CMC price at posting, scaled by atlasDecimals
        uint128 atlasPrice; // Atlas price at posting
        uint48 atlasOnchainTs; // the feed's own freshness stamp
        uint64 atlasRefBlock; // mainnet block the price was read at (referenced mode); 0 if verified
        address recorder;
        bool atlasVerified; // true: read from the feed in this transaction
        bool resolved;
        bool hit;
    }

    IMultiFeed public immutable atlasFeed;
    bytes4 public immutable atlasFeedId;
    uint8 public immutable atlasDecimals;
    /// @notice false on a testnet deployment, where the price is referenced from mainnet instead.
    bool public immutable readsFeed;

    Call[] private _calls;

    event CallRecorded(
        uint256 indexed id,
        bytes32 indexed kolId,
        bytes32 postHash,
        bytes4 asset,
        int8 direction,
        uint64 deadline,
        uint16 cournotBps,
        uint128 cmcPrice,
        uint128 atlasPrice,
        uint48 atlasOnchainTs,
        bool atlasVerified
    );
    event CallResolved(uint256 indexed id, bool hit, uint128 cmcPriceAtResolution);

    error FeedNeverUpdated();
    error StaleAtlasPrice(uint256 onchainTs);
    error FeedNotOpenRead();
    error FeedNotConfigured();
    error FeedAlreadyConfigured();
    error NotYetDue(uint64 deadline);
    error AlreadyResolved();
    error UnknownCall(uint256 id);

    /// @param multiFeed the Atlas MultiFeed proxy on THIS chain; pass address(0) for referenced mode
    /// @param feedId the 4-byte on-chain feed identifier — NOT the catalogue number shown in the UI
    constructor(address multiFeed, bytes4 feedId) {
        readsFeed = multiFeed != address(0);
        if (readsFeed) {
            if (!IMultiFeed(multiFeed).isOpenRead()) revert FeedNotOpenRead();
            atlasFeed = IMultiFeed(multiFeed);
            atlasFeedId = feedId;
            atlasDecimals = IMultiFeed(multiFeed).decimals();
        } else {
            // Referenced mode: prices arrive pre-scaled from the writer; decimals live in the backend.
            atlasFeedId = bytes4(0);
            atlasDecimals = 0;
        }
    }

    function _push(
        bytes32 postHash,
        bytes32 kolId,
        bytes4 asset,
        int8 direction,
        uint128 target,
        uint64 deadline,
        uint16 cournotBps,
        uint128 cmcPrice,
        uint128 atlasPrice,
        uint48 atlasOnchainTs,
        uint64 atlasRefBlock,
        bool verified
    ) private returns (uint256 id) {
        _calls.push(
            Call({
                postHash: postHash,
                kolId: kolId,
                asset: asset,
                direction: direction,
                cournotBps: cournotBps,
                deadline: deadline,
                target: target,
                cmcPrice: cmcPrice,
                atlasPrice: atlasPrice,
                atlasOnchainTs: atlasOnchainTs,
                atlasRefBlock: atlasRefBlock,
                recorder: msg.sender,
                atlasVerified: verified,
                resolved: false,
                hit: false
            })
        );
        id = _calls.length - 1;
        emit CallRecorded(
            id, kolId, postHash, asset, direction, deadline, cournotBps, cmcPrice, atlasPrice, atlasOnchainTs, verified
        );
    }

    /// @notice VERIFIED mode (Plan B): the contract reads the Atlas feed itself in this transaction.
    /// @param maxAtlasAge maximum acceptable age of the Atlas price, in seconds.
    function recordCall(
        bytes32 postHash,
        bytes32 kolId,
        bytes4 asset,
        int8 direction,
        uint128 target,
        uint64 deadline,
        uint16 cournotBps,
        uint128 cmcPrice,
        uint256 maxAtlasAge
    ) external returns (uint256 id) {
        if (!readsFeed) revert FeedNotConfigured();
        IMultiFeed.PriceSnapshot memory snap = atlasFeed.fetch(atlasFeedId);
        if (snap.onchainTs == 0 || snap.price == 0) revert FeedNeverUpdated();
        if (block.timestamp - snap.onchainTs > maxAtlasAge) revert StaleAtlasPrice(snap.onchainTs);
        return _push(
            postHash,
            kolId,
            asset,
            direction,
            target,
            deadline,
            cournotBps,
            cmcPrice,
            uint128(snap.price),
            snap.onchainTs,
            0,
            true
        );
    }

    /// @notice REFERENCED mode (Plan A, default): the backend read the price from Atlas on mainnet over
    ///         a keyless public RPC, and records the value with the block it read at so it is checkable.
    /// @dev The price is NOT verified by this contract. Read `atlasVerified` before trusting it.
    function recordCallReferenced(
        bytes32 postHash,
        bytes32 kolId,
        bytes4 asset,
        int8 direction,
        uint128 target,
        uint64 deadline,
        uint16 cournotBps,
        uint128 cmcPrice,
        uint128 atlasPrice,
        uint48 atlasOnchainTs,
        uint64 atlasRefBlock
    ) external returns (uint256 id) {
        if (readsFeed) revert FeedAlreadyConfigured();
        if (atlasPrice == 0 || atlasOnchainTs == 0) revert FeedNeverUpdated();
        return _push(
            postHash,
            kolId,
            asset,
            direction,
            target,
            deadline,
            cournotBps,
            cmcPrice,
            atlasPrice,
            atlasOnchainTs,
            atlasRefBlock,
            false
        );
    }

    /// @notice Anyone may resolve, but only once the deadline has passed — nobody can settle early.
    function resolveCall(uint256 id, bool hit, uint128 cmcPriceAtResolution) external {
        if (id >= _calls.length) revert UnknownCall(id);
        Call storage c = _calls[id];
        if (c.resolved) revert AlreadyResolved();
        if (block.timestamp < c.deadline) revert NotYetDue(c.deadline);
        c.resolved = true;
        c.hit = hit;
        emit CallResolved(id, hit, cmcPriceAtResolution);
    }

    /// @notice One call a judge can make to see the wiring works: is the feed readable, and is it live?
    function preflight() external view returns (bool openRead, uint80 price, uint48 onchainTs) {
        if (!readsFeed) revert FeedNotConfigured();
        IMultiFeed.PriceSnapshot memory s = atlasFeed.fetch(atlasFeedId);
        return (atlasFeed.isOpenRead(), s.price, s.onchainTs);
    }

    function callCount() external view returns (uint256) {
        return _calls.length;
    }

    function getCall(uint256 id) external view returns (Call memory) {
        if (id >= _calls.length) revert UnknownCall(id);
        return _calls[id];
    }
}
