const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const childprocess = require('child_process');
const csvToJson = require('csvtojson');
const ethers = require('ethers');
const cron = require('node-cron');
const say = require('say');
const _ = require('lodash');

const { utils, BigNumber } = ethers;

const {
  TRADING_PKEY,
  PRIVATE_RPCS,
  DEAD_ADDRESS,
  PROVIDER,
  SIGNER,
  ABIS,
  CONTRACTS,
  TOKENS,
  DECIMALS,
} = require('./config');

const {
  sleep,
  getProfit,
  getApprovals,
  getGmxPrices,
  getCheapestBorrow,
  getTokenData,
  getPositions,
  getBalances,
} = require('./utils');

const executeTrades = async ({tradeDataFile, leverage}) => {

  console.log(await getGmxPrices());

  // CONTRACTS
  const positionRouter = new ethers.Contract(CONTRACTS.POSITION_ROUTER, ABIS.POSITION_ROUTER, SIGNER);
  const swapRouter = new ethers.Contract(CONTRACTS.ROUTER, ABIS.ROUTER, SIGNER);
  const reader = new ethers.Contract(CONTRACTS.READER, ABIS.READER, SIGNER);
  // TODO use a better swap router than GMX's builtin one
  // const uniswap = new ethers.Contract(CONTRACTS.UNISWAP, ABIS.UNISWAP, SIGNER);

  // LOAD TRADING SIGNAL DATA FROM BACKTESTING LIBRARY
  const tradingData = await csvToJson().fromFile(tradeDataFile);
  const mostRecentCandle = tradingData[tradingData.length - 1];

  let positions = await getPositions(SIGNER.address);
  const isLongOpen = !positions.long.size.eq(0)
  const isShortOpen = !positions.short.size.eq(0)

  // HANDLE HICCUPS IN CASE GMX STATE DOESNT MATCH BACKTEST SIGNAL
  let signal = mostRecentCandle.POSITION;
  signal = (signal.startsWith("WAIT") && isLongOpen) ? "CLOSE LONG" : signal;
  signal = (signal.startsWith("WAIT") && isShortOpen) ? "CLOSE SHORT" : signal;
  signal = (signal.startsWith("LONGING") && !isLongOpen) ? "OPEN LONG" : signal;
  signal = (signal.startsWith("SHORTING") && !isShortOpen) ? "OPEN SHORT" : signal;
  console.log("SIGNAL:", signal);

  // TODO Configure usd token to account for funding rates
  // if were shorting, we just pick the cheapest funding rate
  // if were longing, we pick whatever we shorted with
  const usdToken = "USDC";
  // const usdToken = (signal.startsWith("OPEN SHORT")) ? await getCheapestBorrow() : positions.shortSymbol;
  const [ USD_DECIMALS, USD_ADDRESS ] = {
    "DAI":  [DECIMALS.DAI,  TOKENS.DAI],
    "USDT": [DECIMALS.USDT, TOKENS.USDT],
    "USDC": [DECIMALS.USDC, TOKENS.USDC],
  }[usdToken];

  let ethData = await getTokenData("ETH");
  let usdData = await getTokenData(usdToken);

  // console.log("ethData: ", ethData);
  // console.log("positions: ", positions);
  // console.log("usdToken: ", usdToken);
  // console.log(await getApprovals(SIGNER.address));
  // console.log(await getBalances(SIGNER.address));

  // NOTES
  // OPEN GMX LONG => NEED TO POST ETH COLLATERAL
  // OPEN GMX SHORT => NEED TO POST USD COLLATERAL
  // CLOSE GMX LONG => GET ETH
  // CLOSE GMX SHORT => GET USD

  if (isLongOpen && signal.startsWith("CLOSE LONG")) {

    console.log("Closing Long...");
    await say.speak(`ETHER, closing long at ${getProfit(positions.long, leverage)}`);

    const minExecutionFee = await positionRouter.minExecutionFee();
    const closeLongTx = await positionRouter.createDecreasePosition(
      [TOKENS.WETH],
      TOKENS.WETH,
      0, // collateralDelta
      positions.long.size,
      true,
      SIGNER.address,
      ethers.BigNumber.from(ethData.minPrice).mul(99).div(100),
      0,
      minExecutionFee,
      true, // withdraw eth
      { value: minExecutionFee }
    );
    const closeLongReceipt = await closeLongTx.wait();
    await sleep(10*1000); // let keeper pick it up...

    positions = await getPositions(SIGNER.address);
    console.log("UPDATED POSITIONS: ", positions)
    if (!positions.long.size.eq(0)) {
      await say.speak(`FAILED TO CLOSE LONG`);
      throw new Error("Long not closed");
    }

    // TODO use uniswap/1inch
    // got back eth... swap to USD for next trade
    let balances = await getBalances(SIGNER.address);
    console.log("BALANCES BEFORE SWAP: ", balances);
    const amountIn = balances.WETH.sub(BigNumber.from(10).pow(18).div(50));  // keep 0.02 eth
    const minOut = await reader.getAmountOut(
      CONTRACTS.VAULT,
      TOKENS.WETH,
      TOKENS[usdToken],
      amountIn,
    );
    console.log(minOut)
    const swapTx = await swapRouter.swapETHToTokens(
      [TOKENS.WETH, TOKENS[usdToken]],
      minOut[0],
      SIGNER.address,
      { value: amountIn }
    );
    await swapTx.wait();
    balances = await getBalances(SIGNER.address);
    console.log("BALANCES AFTER SWAP: ", balances);

  } else if (isShortOpen && signal.startsWith("CLOSE SHORT")) {

    console.log("Closing Short...");
    await say.speak(`ETHER, closing short at ${getProfit(positions.short, leverage)}`);

    const minExecutionFee = await positionRouter.minExecutionFee();
    const closeShortTx = await positionRouter.createDecreasePosition(
      [TOKENS[usdToken]],
      TOKENS.WETH,
      0, // collateralDelta
      positions.short.size,
      false,
      SIGNER.address,
      ethers.BigNumber.from(ethData.maxPrice).mul(101).div(100),
      0,
      minExecutionFee,
      true, // withdraw eth
      { value: minExecutionFee }
    );
    const closeShortReceipt = await closeShortTx.wait();
    await sleep(10*1000); // let keeper pick it up...

    positions = await getPositions(SIGNER.address);
    console.log("UPDATED POSITIONS: ", positions)
    if (!positions.short.size.eq(0)) {
      await say.speak(`FAILED TO CLOSE SHORT`);
      throw new Error("Short not closed");
    }

  } else if (!isLongOpen && signal.startsWith("OPEN LONG")) {

    // TODO if we're holding USD, swap it to eth

    // assume we're holding USD
    usdData = await getTokenData(usdToken);
    const rawUsdTokenBalance = (await getBalances(SIGNER.address))[usdToken];
    const amountIn = utils.formatUnits(rawUsdTokenBalance, DECIMALS[usdToken]);
    const usdBalance = amountIn * utils.formatUnits(usdData.maxPrice, DECIMALS.GMX);
    const newPositionSize = usdBalance * leverage;

    console.log("Opening Long...", {
      "USD symbol": usdData.symbol,
      "USD Funding rate": usdData.fundingRate,
      "rawUsdTokenBalance": rawUsdTokenBalance,
      "amountIn": amountIn,
      "usdBalance": usdBalance,
      "newPositionSize": newPositionSize,
    });

    const minExecutionFee = await positionRouter.minExecutionFee();
    const openLongTx = await positionRouter.createIncreasePosition(
      [TOKENS[usdToken], TOKENS.WETH],
      TOKENS.WETH,
      rawUsdTokenBalance,
      0,
      utils.parseUnits(newPositionSize.toString(), DECIMALS.GMX),
      true,
      ethers.BigNumber.from(ethData.minPrice).mul(101).div(100),
      minExecutionFee,
      ethers.constants.HashZero,
      { value: minExecutionFee }
    );
    const openLongReceipt = await openLongTx.wait();
    await sleep(10*1000); // let keeper pick it up...

    positions = await getPositions(SIGNER.address);
    console.log("UPDATED POSITIONS: ", positions)
    if (positions.long.size.eq(0)) {
      await say.speak(`FAILED TO OPEN LONG`);
      throw new Error("Long not opened");
    }

  } else if (!isShortOpen && signal.startsWith("OPEN SHORT")) {

    // TODO if we're not holding USD, swap eth-0.02 to USD

    // assume we're holding USD
    usdData = await getTokenData(usdToken);
    const rawUsdTokenBalance = (await getBalances(SIGNER.address))[usdToken];
    const amountIn = utils.formatUnits(rawUsdTokenBalance, TOKENS[usdToken]);
    const usdBalance = amountIn * utils.formatUnits(usdData.maxPrice, DECIMALS.GMX);
    const newPositionSize = usdBalance * leverage;

    console.log("Opening Short...", {
      "USD symbol": usdData.symbol,
      "USD Funding rate": usdData.fundingRate,
      "rawUsdTokenBalance": rawUsdTokenBalance,
      "amountIn": amountIn,
      "usdBalance": usdBalance,
      "newPositionSize": newPositionSize,
    });

    // TODO check funding rates
    const minExecutionFee = await positionRouter.minExecutionFee();
    const openShortTx = await positionRouter.createIncreasePosition(
      [TOKENS[usdToken]],
      TOKENS.WETH,
      rawUsdTokenBalance,
      0,
      utils.parseUnits(newPositionSize.toString(), DECIMALS.GMX),
      false,
      ethers.BigNumber.from(ethData.maxPrice).mul(99).div(100),
      minExecutionFee,
      ethers.constants.HashZero,
      { value: minExecutionFee }
    );
    const openShortReceipt = await openShortTx.wait();
    await sleep(10*1000); // let keeper pick it up...

    positions = await getPositions(SIGNER.address);
    console.log("UPDATED POSITIONS: ", positions)
    if (positions.short.size.eq(0)) {
      await say.speak(`FAILED TO OPEN SHORT`);
      throw new Error("Short not opened");
    }

  } else if (signal.startsWith("LONGING")) {

    console.log(`ETHER LONGING, current profit ${getProfit(positions.long, leverage)}`);
    // say.speak(`ETHER LONGING ${getProfit(positions.long, leverage)}`);

  } else if (signal.startsWith("SHORTING")) {

    console.log(`ETHER SHORTING, current profit: ${getProfit(positions.short, leverage)}`);
    // say.speak(`ETHER SHORTING ${getProfit(positions.short, leverage)}`);

  } else if (signal.startsWith("WAIT")) {

    console.log("waiting...");

  } else {

    throw new Error("Signal not recognized");

  }
}


const main = async (sleepSeconds) => {

  // Sleep to ensure candles are available on bitfinex
  await sleep(sleepSeconds*1000);

  // NOTE this is where you can ingest any necessary info (e.g. recent candles) and apply backtesting logic to generate signals
  // this will not work out of the box for anyone else, but hopefully you get the idea

  await childprocess.execSync(`echo '\n'`, { stdio: 'inherit' });
  await childprocess.execSync(`scp -i ~/crypto/apescanner-backend/apescanner.pem ec2-user@ec2-3-215-63-78.compute-1.amazonaws.com:~/trading-data/longVsShort/watchLvsAgg.csv ~/crypto/trading-data/longVsShort/watchLvsAgg2.csv`, { stdio: 'inherit' })
  await childprocess.execSync(`cd ~/crypto/trading-ingest && /usr/local/bin/pipenv run /usr/bin/python3 bitfinex/main.py --candle_size=1m --export_after=1655321674 --symbols=ETHUSD`, { stdio: 'inherit' })
  await childprocess.execSync(`cd ~/crypto/trading-py && /usr/bin/python3 -m backtesting.1m_LVS.run ETHUSD export`, { stdio: 'inherit' });

  await executeTrades({
    tradeDataFile: `~/crypto/trading-data/longVsShort/ETHUSD_LVS_AGG.csv`,
    leverage: 3, // GMX goes up to 30... dont do it anon
  });
};

if (process.argv.includes("test")) {
  executeTrades().catch(console.error);
}

if (process.argv.includes("full")) {
  main(0).catch(console.error);
}

console.log("Scheduling cronjob. Leave this process running. ");
cron.schedule('* * * * *', () => {
  main(15).catch(console.error);
});
