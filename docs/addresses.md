# Live addresses

Fill this in as you deploy. This is the file judges open first.

| Thing | Network | Address | Notes |
|---|---|---|---|
| **Atlas SingleFeed — BNB/USD** | BSC mainnet (56) | **`0x9C0517F5b4c8657c7F18D68d2d79e2b3b1cd6438`** | **THE one we use.** `description()` = `bnb/usd`, `latestRoundData()` → $551.35 @18dp, block 135890573. Chainlink-compatible; no `fetch()` and no feedId |
| Atlas MultiFeed | BSC mainnet (56) | `0xeace519ebb14fb8404fa6ddd23c3b34abade44aa` | Verified: `contractType()`=2, `decimals()`=18, `isOpenRead()`=true. Serves the tokenized-asset feeds |
| Atlas feedId — #1164 (EWTB/USD) | BSC mainnet (56) | **`0x0000048c`** | Works today, keyless. Kept as the MultiFeed example — **not** the feed for a BNB call |
| **`CallRegistry` (Plan A, referenced)** | BSC testnet (97) | **[`0x6860e45d869cb42d3552bd67aecc9d6fe4bf0360`](https://testnet.bscscan.com/address/0x6860e45d869cb42d3552bd67aecc9d6fe4bf0360)** | Deployed 2026-11-27, block 145032286, [deploy tx](https://testnet.bscscan.com/tx/0x8a1770c03320cd8343b9dbd7aaaaa318d18f6153860f3768dd34d7af6de6b201). Backend reads Atlas on mainnet; receipt stores the price + mainnet block |
| Deployer / recorder wallet | BSC testnet (97) | [`0xC73256E295B7C64C38C99CD519f206FA36695717`](https://testnet.bscscan.com/address/0xC73256E295B7C64C38C99CD519f206FA36695717) | Dedicated wallet; key only in server env |
| `CallRegistry` (Plan B, verified) | BSC mainnet (56) | _TBD_ | contract reads the feed itself; only if time allows |
| CMC symbol watchlist | — | `BNB` | The content endpoint takes one symbol per call; our calls are BNB, so no further symbol is needed |

**How the BNB feed was found** (no key, no account, and nobody had to be asked): `atlasoracle.io/feeds`
has a *Search by pair or ID* box; searching `BNB/USD` returns `#633 BNB/USD`, whose detail page carries a
per-network contract address. `#633` is the global catalogue number — the on-chain contract for BSC is the
SingleFeed above. The MultiFeed's `fetch(bytes4)` returns zeros for it, which is what sent us looking.

## Atlas-probe commands anyone can re-run (no key needed)
```bash
FEED=0xeace519ebb14fb8404fa6ddd23c3b34abade44aa      # MultiFeed
BNB=0x9C0517F5b4c8657c7F18D68d2d79e2b3b1cd6438        # BNB/USD SingleFeed
RPC=https://bsc-dataseed.binance.org
# MultiFeed: isOpenRead() 0xba94e9ff · decimals() 0x313ce567 · contractType() 0xcb2ef6f7
#            fetch(bytes4) 0x7ffc4b97 + the feedId RIGHT-PADDED to 32 bytes (a bare 4 bytes reverts)
curl -s -X POST $RPC -H 'content-type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_call\",\"params\":[{\"to\":\"$FEED\",\"data\":\"0x7ffc4b97<feedId>\"},\"latest\"]}"
# SingleFeed: description() 0x7284e416 · decimals() 0x313ce567 · latestRoundData() 0xfeaf968c
curl -s -X POST $RPC -H 'content-type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_call\",\"params\":[{\"to\":\"$BNB\",\"data\":\"0x7284e416\"},\"latest\"]}"
curl -s -X POST $RPC -H 'content-type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_call\",\"params\":[{\"to\":\"$BNB\",\"data\":\"0xfeaf968c\"},\"latest\"]}"
```
Or in one line, through our own reader: `npm run smoke` prints
`atlas.read singlefeed "bnb/usd" price=… block=…`.

## On-chain proof to cite in the submission
- `recordCall` / `recordCallReferenced` tx: _TBD_
- The `CallRecorded` event it emitted: _TBD_ (`atlasVerified` is in the event — cite it either way)
- The mainnet block the Atlas price was read at (Plan A) / the feed read inside the tx (Plan B): _TBD_
- Cournot request id: _TBD_
- Living Brain capture id: `9b5828f0-f691-44dc-9a1e-bfa542e9c318` (`status=completed after 19.1s`)
