### trading-gmx-executor

This repo takes signals from CSV files on disk (e.g. from a backtesting library) and fills the specified orders on GMX.

If you find any value in this repo, please consider using my reflink to (algo)trade: https://gmx.io/#/?ref=json

### GMX?

[gmx.io](https://gmx.io/#/?ref=json) is a decentralized perpetual exchange available on arbitrum/avalanche.

It offers 0 slippage for entry/exits (up to the available liquidity) and uses an in-house price oracle that aggregates prices across major CEXes to prevent scam wick liquidations, with a chainlink price oracle as a backup.

For more info on interacting with GMX's contracts, see their docs: https://gmxio.gitbook.io/gmx/contracts

### Algotrading Order Executor

Algotrading pipelines are essentially ETL jobs that Extract market data, Transform market data into signals, and then Load orders to market:

1. Extract - fetch candles & auxiliary data - e.g. https://github.com/halljson/bitfinex-ohlc-import
2. Transform - backtest and/or generate signals - will be open sourcing my take soon
3. Load - read signals and send orders to market <- you are here

### Setup

Use a market data source e.g. https://github.com/halljson/bitfinex-ohlc-import to get candle data into `../trading-data`

Use a backtesting library to generate trading signals in `../trading-data/signals`

Put all relevant secrets in a `../secrets.json` file:

```json
{
  "TRADING_PKEY": "",
  "PRIVATE_RPCS": {
    "ARBITRUM": "",
    "AVALANCHE": ""
  }
}
```

Read `executeTrades.js` to ensure it will handle your signals.

1. Configure it to find the right signal file
2. Use the right poll interval and leverage
3. Test with small amounts in the `TRADING_PKEY` account
4. run `node src/executeTrades.js`.

### TODO

- code cleanup, refactor + comments
- more readme content

Just getting this out the door for now.
