# GMX Programmatic Trade Executor

GMX is a a decentralized perpetual exchange on arbitrum/avalanche. For more info on GMX's implementation: https://gmxio.gitbook.io/gmx/contracts

This repo takes signals from CSV files on disk (e.g. created by a backtesting library) and fills the necessary orders on GMX.

- The candle ingestion logic is already available at https://github.com/halljson/bitfinex-ohlc-import
- I'll opensource my backtesting library to go alongside this.
- TODO: code cleanup, more documentation... just getting this out the door for now

If you find any value in this repo, please consider using my reflink: https://gmx.io/#/?ref=json (available on arbitrum and avalanche)
