/*
- AMM Volume Bot - 
This is a simple AMM volumizer bot that automatically trades tokens on decentralized exchanges (DEX) so that price values are registered and available on a regular basis. Most DEX APIs will not update price data if there are no trades happening for more than a day. This bot aims to solve that problem by automatically executing a small trade at regular intervals. Prerequisite is that you will need to have some of your ERC20 tokens in your wallet, and you must first give token approval to the AMM router of the DEX for token spending. Once the bot is operational, it will sell tokens for the native coin every X hrs. All values are configurable in the code. :)  
*/

// Import required node modules
const { ethers, JsonRpcProvider } = require("ethers");
const scheduler = require("node-schedule");
const nodemailer = require("nodemailer");
const figlet = require("figlet");
require("dotenv").config();
const fs = require("fs");
const TelegramBot = require('node-telegram-bot-api');
const gaussian = require('gaussian');
const { logger, TRADE_LEVELS } = require('./utils/logger');
const TradingSafeguards = require('./utils/safeguards');
const { withRetry } = require('./utils/retry');

// Import environment variables
const WALLET_ADDRESS = process.env.USER_ADDRESS;
const USER_PRIVATE_KEY = process.env.USER_PRIVATE_KEY;
const RPC_URL = process.env.RPC_URL;
const TOKEN = process.env.TARGET_TOKEN;
const WETH = process.env.WETH;
const ROUTER = process.env.ROUTER;
const TX_DELAY_MIN = parseInt(process.env.TX_DELAY_MIN);
const TX_DELAY_MAX = parseInt(process.env.TX_DELAY_MAX);
const MIN_AMT = parseFloat(process.env.MIN_AMT);
const BUY_AMT_MEAN = parseFloat(process.env.BUY_AMT_MEAN);
const BUY_AMT_STD_DEV = parseFloat(process.env.BUY_AMT_STD_DEV);
const STRATEGY_BIAS = parseFloat(process.env.STRATEGY_BIAS || "0");

// Configuration pour les tokens non standard
const TOKEN_DECIMALS = 18; // Utilisation de 18 décimales par défaut

// Storage obj
var report = [];
var trades = {
  previousTrade: "",
  nextTrade: "",
  count: 0,
};

// Contract ABI (please grant ERC20 approvals)
const pancakeSwapRouterABI = [
  {
    "inputs": [
      {"internalType": "uint256","name": "amountIn","type": "uint256"},
      {"internalType": "uint256","name": "amountOutMin","type": "uint256"},
      {"internalType": "address[]","name": "path","type": "address[]"},
      {"internalType": "address","name": "to","type": "address"},
      {"internalType": "uint256","name": "deadline","type": "uint256"}
    ],
    "name": "swapExactTokensForETHSupportingFeeOnTransferTokens",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "uint256","name": "amountOutMin","type": "uint256"},
      {"internalType": "address[]","name": "path","type": "address[]"},
      {"internalType": "address","name": "to","type": "address"},
      {"internalType": "uint256","name": "deadline","type": "uint256"}
    ],
    "name": "swapExactETHForTokensSupportingFeeOnTransferTokens",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "uint256","name": "amountIn","type": "uint256"},
      {"internalType": "address[]","name": "path","type": "address[]"}
    ],
    "name": "getAmountsOut",
    "outputs": [{"internalType": "uint256[]","name": "amounts","type": "uint256[]"}],
    "stateMutability": "view",
    "type": "function"
  }
];

// Initiating telegram bot
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_THREAD_ID = process.env.TELEGRAM_THREAD_ID;
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });

// Fetch Report Options
const SEND_EMAIL_REPORT = process.env.SEND_EMAIL_REPORT === 'true';
const SEND_TELEGRAM_REPORT = process.env.SEND_TELEGRAM_REPORT === 'true';

// Ethers vars for web3 connections
var provider, wallet, router;

// Utility function to calculate optimal gas price
async function calculateOptimalGasPrice(provider, balance) {
  try {
    // Get current gas price from network
    const feeData = await provider.getFeeData();
    const baseGasPrice = feeData.gasPrice;
    
    // Calculate maximum gas price we can afford (leaving some BNB for the actual swap)
    const maxGasForTx = 500000n; // Our gas limit
    const maxAffordableGasPrice = (balance * 30n) / (maxGasForTx * 100n); // Use only 30% of balance for gas
    
    // Ensure minimum of 1 gwei
    const minGasPrice = ethers.parseUnits('1', 'gwei');
    
    // Use the lower of the two prices, but never below 1 gwei
    let optimalGasPrice = baseGasPrice < maxAffordableGasPrice ? baseGasPrice : maxAffordableGasPrice;
    optimalGasPrice = optimalGasPrice < minGasPrice ? minGasPrice : optimalGasPrice;
    
    console.log(`Current network gas price: ${ethers.formatUnits(baseGasPrice, 'gwei')} gwei`);
    console.log(`Maximum affordable gas price: ${ethers.formatUnits(maxAffordableGasPrice, 'gwei')} gwei`);
    console.log(`Using gas price: ${ethers.formatUnits(optimalGasPrice, 'gwei')} gwei`);
    
    return optimalGasPrice;
  } catch (error) {
    console.error('Error calculating gas price:', error);
    // Return 1 gwei as fallback
    return ethers.parseUnits('1', 'gwei');
  }
}

// Utility function to generate random normal numbers
function generateRandomNormal(mean, stdDev) {
  let u1 = Math.random();
  let u2 = Math.random();
  
  // Box-Muller transform
  let z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return mean + stdDev * z0;
}

// Add this utility function
async function getTokenBalance() {
  const tokenContract = new ethers.Contract(TOKEN, [
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)"
  ], provider);
  
  const balance = await tokenContract.balanceOf(WALLET_ADDRESS);
  return ethers.formatEther(balance);
}

// Get token price from DEX
async function getTokenPrice() {
  try {
    const amountIn = ethers.parseEther("1"); // 1 token
    const amounts = await router.getAmountsOut(amountIn, [TOKEN, WETH]);
    return Number(ethers.formatEther(amounts[1]));
  } catch (error) {
    logger.error('Error getting token price', {
      error: error.message,
      level: TRADE_LEVELS.PRICE_ERROR
    });
    return 0;
  }
}

// State tracking
const STATE = {
  lastAction: null,
  lastPrice: null,
  tradeCount: 0,
  lastBuyTotal: 0,    // Ajout pour tracker le montant total acheté
  lastBuyTime: null   // Ajout pour le timing précis
};

// Trading constants
const TRADE_CONFIG = {
  BUY: {
    SPLITS: 3,                    // 3 achats stratégiques
    BASE_PERCENTAGE: 0.018,       // 1.8% par achat (5.4% total)
    DELAY_RANGE: [15, 35],        // 15-35 minutes entre achats
    GAS_THRESHOLD: "MEDIUM_LOW",  // Exécuter quand gas raisonnable
    TIMING: "SMART",             // Après mini-dips ou stagnation
    SLIPPAGE: 40                 // Garder le même slippage pour sécurité
  },
  SELL: {
    SPLITS: 1,                    // Une seule vente consolidée
    SIZE_MULTIPLIER: 1.0,         // Exactement égal aux achats (5.4%)
    DELAY_RANGE: [15, 35],        // 15-35 minutes après dernier achat
    GAS_THRESHOLD: "ANY",         // Exécuter quand nécessaire
    TIMING: "OFF_PEAK",          // Pendant périodes calmes
    SLIPPAGE: 40                 // Garder le même slippage pour sécurité
  }
};

// Price impact calculation
async function calculatePriceImpact(amountIn, path, isBuy) {
  try {
    // Get current price
    const baseAmount = ethers.parseEther("1");
    const basePrice = await router.getAmountsOut(baseAmount, path);
    
    // Get price after potential trade
    const tradeAmount = isBuy ? amountIn : ethers.parseEther(amountIn.toString());
    const impactPrice = await router.getAmountsOut(tradeAmount, path);
    
    // Calculate price impact
    const currentPrice = Number(ethers.formatEther(basePrice[1])) / Number(ethers.formatEther(basePrice[0]));
    const impactedPrice = Number(ethers.formatEther(impactPrice[1])) / Number(ethers.formatEther(impactPrice[0]));
    
    const priceImpact = Math.abs((impactedPrice - currentPrice) / currentPrice * 100);
    console.log(`Estimated price impact: ${priceImpact.toFixed(2)}%`);
    
    return priceImpact;
  } catch (error) {
    console.error('Error calculating price impact:', error);
    return 0;
  }
}

// Enhanced buy function
async function buyTokensCreateVolume() {
  try {
    logger.info('Initiating buy sequence');
    
    // Check gas price and market conditions
    const safeguards = new TradingSafeguards({
      maxSlippage: process.env.MAX_SLIPPAGE || 2.0,
      maxPriceDeviation: process.env.MAX_PRICE_DEVIATION || 5.0,
      maxGasPrice: process.env.MAX_GAS_PRICE || 100
    });

    const balance = await provider.getBalance(WALLET_ADDRESS);
    console.log(`Current BNB balance: ${ethers.formatEther(balance)} BNB`);

    let successfulBuys = 0;
    
    // Execute multiple buys
    for(let i = 0; i < TRADE_CONFIG.BUY.SPLITS; i++) {
      // Check conditions before each buy
      if (!await safeguards.checkGasPrice(provider)) {
        logger.error(`Buy ${i+1}/${TRADE_CONFIG.BUY.SPLITS} cancelled due to high gas price`);
        continue;
      }

      const price = await getTokenPrice();
      if (!await safeguards.checkPriceDeviation(price)) {
        logger.error(`Buy ${i+1}/${TRADE_CONFIG.BUY.SPLITS} cancelled due to price deviation`);
        continue;
      }

      // Calculate buy amount
      const baseAmount = parseFloat(process.env.BUY_AMT_MEAN) || 0.001;
      let buyAmount = Math.abs(baseAmount * TRADE_CONFIG.BUY.BASE_PERCENTAGE);
      
      // Add small random variation (±5%)
      buyAmount *= (1 + (Math.random() - 0.5) * 0.1);
      
      // Calculate gas costs more accurately
      const gasPrice = await provider.getFeeData();
      const estimatedGasCost = gasPrice.gasPrice * BigInt(500000); // Gas limit for the transaction
      const currentBalance = await provider.getBalance(WALLET_ADDRESS);
      
      // Reserve enough for gas (3x estimated cost for safety)
      const reserveForGas = estimatedGasCost * 3n;
      const availableForSwap = currentBalance - reserveForGas;
      
      // Convert to ether for comparison
      const maxSpendable = Number(ethers.formatEther(availableForSwap));
      const minAmount = parseFloat(process.env.MIN_AMT) || 0.0001;
      
      // If we don't have enough for minimum amount + gas, skip this buy
      if (maxSpendable < minAmount) {
        console.log(`Insufficient balance for swap + gas. Available: ${maxSpendable} BNB, Minimum needed: ${minAmount} BNB`);
        continue;
      }
      
      // Adjust buy amount to available balance
      buyAmount = Math.max(Math.min(buyAmount, maxSpendable), minAmount);
      
      if (buyAmount <= 0) {
        logger.error(`Buy ${i+1}/${TRADE_CONFIG.BUY.SPLITS} cancelled: Invalid amount ${buyAmount}`);
        continue;
      }
      
      console.log(`Executing buy ${i+1}/${TRADE_CONFIG.BUY.SPLITS}: ${buyAmount} BNB`);
      
      const success = await swapExactETHForTokensWithRetry(
        buyAmount,
        [WETH, TOKEN]
      );

      if (success) {
        successfulBuys++;
        STATE.lastAction = 'buy';
        STATE.tradeCount++;
        STATE.lastBuyTotal += buyAmount; // Update last buy total
        STATE.lastBuyTime = new Date(); // Update last buy time
        
        // Wait between splits unless it's the last buy
        if (i < TRADE_CONFIG.BUY.SPLITS - 1) {
          const delaySeconds = Math.floor(
            Math.random() * 
            (TRADE_CONFIG.BUY.DELAY_RANGE[1] - TRADE_CONFIG.BUY.DELAY_RANGE[0]) + 
            TRADE_CONFIG.BUY.DELAY_RANGE[0]
          );
          console.log(`Waiting ${delaySeconds} seconds before next buy...`);
          await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
        }
      }
    }

    logger.info('Buy sequence completed', {
      level: TRADE_LEVELS.TRADE_EXECUTED,
      successfulBuys,
      totalAttempted: TRADE_CONFIG.BUY.SPLITS
    });
    return successfulBuys > 0;
  } catch (error) {
    logger.error('Buy sequence failed', {
      level: TRADE_LEVELS.TRADE_FAILED,
      error: error.message
    });
    return false;
  }
}

// Enhanced sell function
async function sellTokensCreateVolume() {
  try {
    logger.info('Initiating sell transaction');
    
    // Vérifier le timing depuis le dernier achat
    if (!STATE.lastBuyTime) {
      logger.error('No previous buy found');
      return false;
    }
    
    const timeSinceLastBuy = (new Date() - STATE.lastBuyTime) / 1000; // en secondes
    if (timeSinceLastBuy < TRADE_CONFIG.SELL.DELAY_RANGE[0]) {
      logger.info('Waiting for minimum delay before selling');
      return false;
    }
    
    // Check gas price and market conditions
    const safeguards = new TradingSafeguards({
      maxSlippage: process.env.MAX_SLIPPAGE || 2.0,
      maxPriceDeviation: process.env.MAX_PRICE_DEVIATION || 5.0,
      maxGasPrice: process.env.MAX_GAS_PRICE || 100
    });

    // Basic checks
    if (!await safeguards.checkGasPrice(provider)) {
      logger.error('Sell cancelled due to high gas price');
      return false;
    }

    const price = await getTokenPrice();
    if (!await safeguards.checkPriceDeviation(price)) {
      logger.error('Sell cancelled due to price deviation');
      return false;
    }

    const tokenBalance = await getTokenBalance();
    console.log(`Current token balance: ${tokenBalance} tokens`);

    // Utiliser le montant exact des achats précédents
    let sellAmount = STATE.lastBuyTotal * TRADE_CONFIG.SELL.SIZE_MULTIPLIER;
    
    // Add small random variation (±5%)
    sellAmount *= (1 + (Math.random() - 0.5) * 0.1);
    
    // Ensure we don't exceed balance
    sellAmount = Math.min(sellAmount, tokenBalance * 0.95); // Keep some buffer
    
    console.log(`Attempting to sell ${sellAmount} tokens`);
    
    const success = await swapExactTokensForETHWithRetry(
      sellAmount,
      [TOKEN, WETH]
    );

    if (success) {
      STATE.lastAction = 'sell';
      STATE.tradeCount++;
      STATE.lastBuyTotal = 0; // Reset buy total
      STATE.lastBuyTime = null; // Reset buy time
    }

    logger.info('Sell transaction completed', {
      level: TRADE_LEVELS.TRADE_EXECUTED,
      amount: sellAmount,
      price: price,
      timeSinceLastBuy: Math.floor(timeSinceLastBuy / 60) // en minutes
    });
    return success;
  } catch (error) {
    logger.error('Sell transaction failed', {
      level: TRADE_LEVELS.TRADE_FAILED,
      error: error.message
    });
    return false;
  }
}

// Enhanced trading function
async function AMMTrade() {
  console.log('--- AMMTrade Start ---');
  
  try {
    const initialized = await initializeContracts();
    if (!initialized) {
      console.error('Failed to initialize contracts');
      scheduleRetry(5); // Retry in 5 minutes if initialization fails
      return;
    }
    
    // Check token balance
    const tokenBalance = await getTokenBalance();
    console.log(`Current token balance: ${tokenBalance} tokens`);

    // Initial buy if needed
    if (tokenBalance < MIN_AMT) {
      console.log('Not enough tokens, performing initial buy...');
      const initialBuyAmount = (BUY_AMT_MEAN * 3).toFixed(8);
      
      const success = await swapExactETHForTokensWithRetry(
        initialBuyAmount,
        [WETH, TOKEN]
      );
      
      if (!success) {
        console.log('Initial buy failed');
        scheduleRetry(5);
        return;
      }
      console.log('Initial buy successful!');
      STATE.lastAction = 'buy';
    }

    // Determine action based on last trade
    const shouldBuy = STATE.lastAction !== 'buy';
    const success = shouldBuy ? await buyTokensCreateVolume() : await sellTokensCreateVolume();
    
    if (!success) {
      console.error('Trade failed');
      scheduleRetry(5);
      return;
    }

    // Schedule next trade using node-schedule
    const minDelay = shouldBuy ? TRADE_CONFIG.BUY.DELAY_RANGE[0] : TRADE_CONFIG.SELL.DELAY_RANGE[0];
    const maxDelay = shouldBuy ? TRADE_CONFIG.BUY.DELAY_RANGE[1] : TRADE_CONFIG.SELL.DELAY_RANGE[1];
    const delayMinutes = Math.floor(Math.random() * (maxDelay - minDelay + 1) + minDelay);
    
    const nextTradeDate = new Date(Date.now() + delayMinutes * 60 * 1000);
    console.log(`Scheduling next trade for ${nextTradeDate.toISOString()}`);
    
    // Store next trade time
    await storeData({ nextTrade: nextTradeDate.toISOString(), lastAction: STATE.lastAction });
    
    // Schedule next trade
    scheduler.scheduleJob(nextTradeDate, AMMTrade);
    
  } catch (error) {
    console.error('Trade error:', error);
    scheduleRetry(5);
  }
}

// Helper function to schedule retries
function scheduleRetry(minutes) {
  const retryDate = new Date(Date.now() + minutes * 60 * 1000);
  console.log(`Scheduling retry for ${retryDate.toISOString()}`);
  scheduler.scheduleJob(retryDate, AMMTrade);
}

// Update storeData function to accept custom data
async function storeData(customData = {}) {
  try {
    const data = {
      count: trades.count,
      ...customData
    };
    await fs.promises.writeFile('./next.json', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error storing data:', error);
  }
}

// Main Function
const main = async () => {
  try {
    console.log(
      figlet.textSync("AMMTrade", {
        font: "Standard",
        horizontalLayout: "default",
        verticalLayout: "default",
        width: 80,
        whitespaceBreak: true,
      })
    );
    let tradesExists = false;

    // check if trades file exists
    if (!fs.existsSync("./next.json")) await storeData();

    // get stored values from file
    const storedData = JSON.parse(fs.readFileSync("./next.json"));

    // not first launch, check data
    if ("nextTrade" in storedData) {
      const nextTrade = new Date(storedData.nextTrade);
      trades["count"] = Number(storedData["count"]);
      console.log(`Current Count: ${trades["count"]}`);

      // restore trades schedule
      if (nextTrade > new Date()) {
        console.log("Restored Trade: " + nextTrade);
        scheduler.scheduleJob(nextTrade, AMMTrade);
        tradesExists = true;
      }
    }

    // no previous launch
    if (!tradesExists) {
      AMMTrade();
    }
  } catch (error) {
    console.error(error);
  }
};

// Initialize Contracts Function
async function initializeContracts() {
  try {
    console.log('Initializing contracts...');
    provider = new ethers.JsonRpcProvider(RPC_URL);
    wallet = new ethers.Wallet(USER_PRIVATE_KEY, provider);
    router = new ethers.Contract(ROUTER, pancakeSwapRouterABI, wallet);
    
    const balance = await provider.getBalance(WALLET_ADDRESS);
    console.log(`Wallet Balance: ${ethers.formatEther(balance)} BNB`);
    
    return true;
  } catch (error) {
    console.error('Error initializing contracts:', error);
    return false;
  }
}

// Configuration du retry
const retryConfig = {
    maxAttempts: 5,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffFactor: 2,
    jitterFactor: 0.1
};

// Wrapper les fonctions de swap avec retry
async function swapExactETHForTokensWithRetry(amountIn, path) {
  return withRetry(async () => {
    return await swapExactETHForTokens(amountIn, path);
  }, retryConfig);
}

async function swapExactTokensForETHWithRetry(amountIn, path) {
  return withRetry(async () => {
    return await swapExactTokensForETH(amountIn, path);
  }, retryConfig);
}

// Swaps Function (assumes 18 decimals on input amountIn)
async function swapExactETHForTokens(amountIn, path) {
  try {
    const balance = await provider.getBalance(WALLET_ADDRESS);
    console.log(`Current BNB balance: ${ethers.formatEther(balance)} BNB`);
    
    // Calculate optimal gas price based on balance
    const optimalGasPrice = await calculateOptimalGasPrice(provider, balance);

    const amountInWei = ethers.parseEther(amountIn.toString());
    
    // Check if we have enough balance for the swap + gas
    const estimatedGasCost = optimalGasPrice * BigInt(500000);
    if (balance < (amountInWei + estimatedGasCost)) {
      console.log('Insufficient balance for swap + gas');
      return false;
    }

    console.log(`Swapping ${ethers.formatEther(amountInWei)} BNB for tokens...`);
    
    // Get minimum amount out
    const amounts = await router.getAmountsOut(amountInWei, path);
    const amountOut = BigInt(amounts[1].toString());
    const amountOutMin = (amountOut * 60n) / 100n; // 40% slippage
    
    console.log(`Expected minimum output: ${ethers.formatEther(amountOutMin.toString())} tokens`);
    
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes
    
    const tx = await router.swapExactETHForTokensSupportingFeeOnTransferTokens(
      amountOutMin,
      path,
      WALLET_ADDRESS,
      deadline,
      {
        value: amountInWei,
        gasLimit: 500000,
        gasPrice: optimalGasPrice
      }
    );
    
    console.log(`Transaction sent: ${tx.hash}`);
    const receipt = await tx.wait();
    
    if (receipt.status === 1) {
      console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
      return true;
    } else {
      console.log('Transaction failed');
      return false;
    }
  } catch (error) {
    console.error('Swap failed with error:', error.message);
    console.error('Error details:', error);
    console.error('Error stack:', error.stack);
    if (error.data) console.error('Error data:', error.data);
    if (error.reason) console.error('Error reason:', error.reason);
    if (error.code) console.error('Error code:', error.code);
    return false;
  }
}

// Add new swap function for selling tokens
async function swapExactTokensForETH(amountIn, path) {
  try {
    // Check BNB balance first
    const balance = await provider.getBalance(WALLET_ADDRESS);
    console.log(`Current BNB balance: ${ethers.formatEther(balance)} BNB`);
    
    // Calculate optimal gas price based on balance
    const optimalGasPrice = await calculateOptimalGasPrice(provider, balance);

    const tokenContract = new ethers.Contract(TOKEN, [
      "function approve(address spender, uint256 amount) external returns (bool)",
      "function allowance(address owner, address spender) external view returns (uint256)"
    ], wallet);

    // Round to 18 decimal places maximum to avoid numeric fault
    const roundedAmount = Number(amountIn).toFixed(18);
    const amountInWei = ethers.parseEther(roundedAmount);
    
    // Approve tokens if needed
    const allowance = await tokenContract.allowance(WALLET_ADDRESS, ROUTER);
    if (allowance < amountInWei) {
      console.log('Approving tokens...');
      const approveTx = await tokenContract.approve(ROUTER, ethers.MaxUint256, {
        gasLimit: 100000,
        gasPrice: optimalGasPrice
      });
      await approveTx.wait();
      console.log('Tokens approved');
    }

    console.log(`Swapping ${roundedAmount} tokens for BNB...`);
    
    // Get minimum amount out
    const amounts = await router.getAmountsOut(amountInWei, path);
    const amountOut = BigInt(amounts[1].toString());
    const amountOutMin = (amountOut * 60n) / 100n; // 40% slippage
    
    console.log(`Amount In: ${ethers.formatEther(amountInWei)} tokens`);
    console.log(`Expected output: ${ethers.formatEther(amountOut.toString())} BNB`);
    console.log(`Minimum output (with slippage): ${ethers.formatEther(amountOutMin.toString())} BNB`);
    
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes

    const tx = await router.swapExactTokensForETHSupportingFeeOnTransferTokens(
      amountInWei,
      amountOutMin,
      path,
      WALLET_ADDRESS,
      deadline,
      {
        gasLimit: 500000,
        gasPrice: optimalGasPrice
      }
    );
    
    console.log(`Transaction sent: ${tx.hash}`);
    const receipt = await tx.wait();
    
    if (receipt.status === 1) {
      console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
      return true;
    } else {
      console.log('Transaction failed');
      return false;
    }
  } catch (error) {
    console.error('Swap failed with error:', error.message);
    console.error('Error details:', error);
    console.error('Error stack:', error.stack);
    if (error.data) console.error('Error data:', error.data);
    if (error.reason) console.error('Error reason:', error.reason);
    if (error.code) console.error('Error code:', error.code);
    return false;
  }
}

// Send Report Function
const sendReport = (report) => {
  const today = todayDate();
  console.log(report);

  const transporter = nodemailer.createTransport({
    host: "smtp.hostinger.com",
    port: 465,
    secure: true, // Use SSL/TLS
    auth: {
      user: process.env.EMAIL_ADDR,
      pass: process.env.EMAIL_PW,
    },
  });

  const mailOptions = {
    from: process.env.EMAIL_ADDR,
    to: process.env.RECIPIENT,
    subject: "Trade Report: " + today,
    text: JSON.stringify(report, null, 2),
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error("Email sending failed:", error);
    } else {
      console.log("Email sent:", info.response);
    }
  });
};

// Send Telegram Report Function
const sendTelegramReport = async (report) => {
  const today = todayDate();
  
  let message = `🤖 Trade Report: ${today}\n\n`;
  
  if (report.length >= 3) {
    const tradeDetails = report[2];
    if (tradeDetails.trade) {
      message += `Type: ${tradeDetails.trade.type}\n`;
      message += `Amount In: ${tradeDetails.trade.amountIn}\n`;
      message += `Amount Out Min: ${tradeDetails.trade.amountOutMin}\n`;
      message += `Wallet: ${tradeDetails.trade.wallet}\n`;
      message += `Transaction: ${tradeDetails.trade.transaction_url}\n\n`;
    }
    
    message += `Balance: ${tradeDetails.balance} ETH\n`;
    message += `Success: ${tradeDetails.success}\n`;
  }
  
  if (report.length >= 4) {
    const tradeInfo = report[3];
    message += `\nPrevious Trade: ${tradeInfo.previousTrade}\n`;
    message += `Next Trade: ${tradeInfo.nextTrade}\n`;
    message += `Trade Count: ${tradeInfo.count}\n`;
  }

  try {
    const options = {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
    };

    // Add message_thread_id if it's provided in the environment variables
    if (TELEGRAM_THREAD_ID) {
      options.message_thread_id = TELEGRAM_THREAD_ID;
    }

    await bot.sendMessage(options.chat_id, options.text, options);
    console.log('Telegram report sent successfully');
  } catch (error) {
    console.error('Failed to send Telegram report:', error);
    console.error('Error details:', error.response ? error.response.body : error.message);
  }
};

// Current Date Function
const todayDate = () => {
  const today = new Date();
  return today.toLocaleString("en-GB", { timeZone: "Asia/Singapore" });
};

// Data Storage Function
const storeData = async (customData = {}) => {
  try {
    const data = {
      count: trades.count,
      ...customData
    };
    await fs.promises.writeFile('./next.json', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error storing data:', error);
  }
};

main();
