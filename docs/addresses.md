# Live addresses

Fill this in as you deploy. This is the file judges open first.

| Thing | Network | Address | Notes |
|---|---|---|---|
| Atlas MultiFeed | BSC mainnet (56) | `0xeace519ebb14fb8404fa6ddd23c3b34abade44aa` | Verified: `contractType()`=2, `decimals()`=18, `isOpenRead()`=true |
| Atlas feedId — BNB | — | _TBD_ | **Only Atlas can supply this.** 4 bytes, not the catalogue number |
| Atlas feedId — CAKE | — | _TBD_ | as above |
| Atlas feedId — … | — | _TBD_ | one per asset on the same MultiFeed |
| `CallRegistry` (Plan A, referenced) | BSC testnet (97) | _TBD_ | backend read Atlas on mainnet; receipt stores the price + mainnet block |
| `CallRegistry` (Plan B, verified) | BSC mainnet (56) | _TBD_ | contract reads the feed itself; only if time allows |
| CMC symbol watchlist | — | _TBD_ | e.g. BNB, CAKE, … — the content endpoint takes one symbol per call |

## Atlas-probe commands anyone can re-run (no key needed)
```bash
FEED=0xeace519ebb14fb8404fa6ddd23c3b34abade44aa
RPC=https://bsc-dataseed.binance.org
# isOpenRead() 0xba94e9ff · decimals() 0x313ce567 · contractType() 0xcb2ef6f7
# fetch(bytes4) 0x7ffc4b97 + the 8-hex feedId (reverts on an unknown id)
curl -s -X POST $RPC -H 'content-type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_call\",\"params\":[{\"to\":\"$FEED\",\"data\":\"0x7ffc4b97<feedId>\"},\"latest\"]}"
```

## On-chain proof to cite in the submission
- `recordCall` / `recordCallReferenced` tx: _TBD_
- The `CallRecorded` event it emitted: _TBD_ (`atlasVerified` is in the event — cite it either way)
- The mainnet block the Atlas price was read at (Plan A) / the feed read inside the tx (Plan B): _TBD_
- Cournot request id: _TBD_
- Living Brain capture id: _TBD_
