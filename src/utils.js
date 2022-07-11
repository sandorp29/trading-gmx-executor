const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const ethers = require('ethers');
const _ = require('lodash');

const {
  ABIS,
  PROVIDER,
  SIGNER,
  DECIMALS,
  TOKENS,
  CONTRACTS,
} = require('./config');

const sleep = (time) => {
  return new Promise((resolve) => setTimeout(resolve, time));
};

const toFixed = (num, fixed) => {
  if (!num) return;
  const re = new RegExp('^-?\\d+(?:.\\d{0,' + (fixed || -1) + '})?');
  return num.toString().match(re)[0];
};

const getProfit = (position, leverage) => {
  const decimals = new ethers.BigNumber.from(10).pow(DECIMALS.GMX);
  // return `${position.hasProfit.eq(1) ? '+' : '-'}${ethers.utils.formatUnits(position.delta, DECIMALS)}`;
  const percent = position.delta.div(decimals).toString() / position.size.div(decimals).toString();
  return `${position.hasProfit.eq(1) ? '' : '-'}${(percent * leverage * 100).toFixed(0)}%`;
};

const getApprovals = async (userAddress) => {

  const dai = new ethers.Contract(TOKENS.DAI, ABIS.TOKEN, SIGNER);
  const usdc = new ethers.Contract(TOKENS.USDC, ABIS.TOKEN, SIGNER);
  const usdt = new ethers.Contract(TOKENS.USDT, ABIS.TOKEN, SIGNER);
  const weth = new ethers.Contract(TOKENS.WETH, ABIS.TOKEN, SIGNER);

  const approvals = {
    dai: await dai.allowance(userAddress, CONTRACTS.ROUTER),
    usdc: await usdc.allowance(userAddress, CONTRACTS.ROUTER),
    usdt: await usdt.allowance(userAddress, CONTRACTS.ROUTER),
    weth: await weth.allowance(userAddress, CONTRACTS.ROUTER),
  };

  return approvals;
};

const getGmxPrices = async () => {
  const GMX_DIVISOR = ethers.BigNumber.from(10).pow(DECIMALS.GMX);
  const formatGMX = (price, decimals) => (ethers.BigNumber.from(price).mul(100).div(GMX_DIVISOR).toString()/100).toFixed(decimals);
  return await fetch(`https://gmx-server-mainnet.uw.r.appspot.com/prices`)
    .then(resp => resp.json())
    .then(resp => {
      return {
        "BTC": formatGMX(resp['0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f'], 0),
        "ETH": formatGMX(resp['0x82aF49447D8a07e3bd95BD0d56f35241523fBab1'], 2),
        // "UNI": formatGMX(resp['0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0'], 2),
        // "LINK": formatGMX(resp['0xf97f4df75117a78c1A5a0DBb814Af92458539FB4'], 2),
      };
    });
}

const getAllTokenData = async () => {
  return await fetch("https://api.gmx.io/tokens").then(res => res.json());
};

const getCheapestBorrow = async () => {

  const tokenData = await getAllTokenData();
  const dai = _.find(tokenData, token => token.data.symbol === 'DAI').data;
  const usdc = _.find(tokenData, token => token.data.symbol === 'USDC').data;
  const usdt = _.find(tokenData, token => token.data.symbol === 'USDT').data;
  const weth = _.find(tokenData, token => token.data.symbol === 'ETH').data;

  const stables = [dai, usdc, usdt];
  const lowest = _.minBy(stables, data => parseInt(data.fundingRate)).symbol;

  console.log("funding rates: ", {
    'DAI': dai.fundingRate,
    'USDC': usdc.fundingRate,
    'USDT': usdt.fundingRate,
    'WETH': weth.fundingRate,
    "LOWEST": lowest
  });

  return lowest;
};

const getTokenData = async (symbol) => {
  const tokenPrices = await getAllTokenData();
  return _.find(tokenPrices, token => token.data.symbol === symbol).data;
};

const getPositions = async (userAddress) => {

  const reader = new ethers.Contract(CONTRACTS.READER, ABIS.READER, SIGNER);

  const rawPositions = await reader.getPositions(
    CONTRACTS.VAULT,
    userAddress,
    [TOKENS.WETH, TOKENS.USDC, TOKENS.USDT, TOKENS.DAI],
    [TOKENS.WETH, TOKENS.WETH, TOKENS.WETH, TOKENS.WETH],
    [true,        false,       false,       false]
  );

  positions = [];
  for (i=0; i<rawPositions.length/9; i+=1) {
    position = {};
    position.size = rawPositions[i*9+0];
    position.collateral = rawPositions[i*9+1];
    position.averagePrice = rawPositions[i*9+2];
    position.entryFundingRate = rawPositions[i*9+3];
    position.hasRealisedProfit = rawPositions[i*9+4];
    position.realisedPnl = rawPositions[i*9+5];
    position.lastIncreasedTime = rawPositions[i*9+6];
    position.hasProfit = rawPositions[i*9+7];
    position.delta = rawPositions[i*9+8];
    positions.push(position);
  }

  if (!positions[1].size.eq(0)) {
    shortSymbol = "USDC";
  } else if (!positions[2].size.eq(0)) {
    shortSymbol = "USDT";
  } else {
    shortSymbol = "DAI";
  }

  return {
    shortSymbol,
    long: positions[0],
    short: _.find(_.drop(positions), item => !item.size.eq(0)) || positions[1],
  };
};

const getBalances = async (userAddress) => {

  const dai = new ethers.Contract(TOKENS.DAI, ABIS.TOKEN, SIGNER);
  const usdc = new ethers.Contract(TOKENS.USDC, ABIS.TOKEN, SIGNER);
  const usdt = new ethers.Contract(TOKENS.USDT, ABIS.TOKEN, SIGNER);

  const balances = {
    DAI: await dai.balanceOf(userAddress),
    USDC: await usdc.balanceOf(userAddress),
    USDT: await usdt.balanceOf(userAddress),
    WETH: await PROVIDER.getBalance(userAddress),
  };

  return balances;
};

module.exports = {
  sleep,
  toFixed,
  getProfit,
  getApprovals,
  getGmxPrices,
  getAllTokenData,
  getCheapestBorrow,
  getTokenData,
  getPositions,
  getBalances,
};
