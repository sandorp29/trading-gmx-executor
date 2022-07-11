const ethers = require('ethers');
const { utils } = ethers;
const { TRADING_PKEY, PRIVATE_RPCS } = require('../../secrets.json');
if (TRADING_PKEY === undefined) throw new Error("Need TRADING_PKEY in secrets");

const PROVIDER = new ethers.providers.JsonRpcProvider(PRIVATE_RPCS.ARBITRUM);

module.exports = {
  PRIVATE_RPCS,
  TRADING_PKEY,
  PROVIDER,
  SIGNER: new ethers.Wallet(TRADING_PKEY, PROVIDER),
  DEAD_ADDRESS: utils.getAddress("0x0000000000000000000000000000000000000000"),
  ABIS: {
    POSITION_ROUTER: require('../abis/PositionRouterAbi').PositionRouterAbi,
    UNISWAP: require('../abis/UniswapAbi').UniswapAbi,
    ROUTER: require('../abis/RouterAbi').RouterAbi,
    READER: require('../abis/ReaderAbi').ReaderAbi,
    TOKEN: require('../abis/ERC20Abi').ERC20Abi,
  },
  CONTRACTS: {
    POSITION_ROUTER: utils.getAddress("0x3d6ba331e3d9702c5e8a8d254e5d8a285f223aba"),
    UNISWAP: utils.getAddress("0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45"),
    ROUTER: utils.getAddress("0xabbc5f99639c9b6bcb58544ddf04efa6802f4064"),
    READER: utils.getAddress("0x1e904F292FFd165a9f40d37b757fed65CA826058"),
    VAULT: utils.getAddress("0x489ee077994B6658eAfA855C308275EAd8097C4A"),
  },
  TOKENS: {
    WETH: utils.getAddress("0x82aF49447D8a07e3bd95BD0d56f35241523fBab1"),
    WBTC: utils.getAddress("0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f"),
    USDC: utils.getAddress("0xff970a61a04b1ca14834a43f5de4533ebddb5cc8"),
    USDT: utils.getAddress("0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9"),
    DAI: utils.getAddress("0xda10009cbd5d07dd0cecc66161fc93d7c9000da1"),
  },
  DECIMALS: {
    WETH: 18,
    WBTC: 18,
    USDC: 6,
    USDT: 6,
    DAI: 18,
    GMX: 30,
  },
};
