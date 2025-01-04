# 🤖 AMM Volume Bot

## 📊 Overview

AMM Volume Bot is a simple automated market maker (AMM) volumizer that executes small trades at regular intervals on decentralized exchanges (DEX). This bot helps maintain up-to-date price data for tokens that might not have frequent trades.

## 🌟 Features

- 🔄 Alternates between buying and selling tokens
- ⏱️ Configurable trade intervals (15-35 minutes by default)
- 💰 Dynamic calculation of trade amounts using Gaussian distribution
- 📈 Supports multiple DEX platforms
- 📧 Email reporting (optional)
- 📱 Telegram reporting (optional)
- 💾 Persistent trade data storage
- 🎯 Configurable strategy bias for long-term token accumulation or ETH profit
- 🔁 Auto-retry mechanism for failed transactions
- 📊 Enhanced error handling and logging
- 🚀 Easy deployment to Railway.app

## 🛠️ Installation

1. Clone the repository:
   ```
   git clone https://github.com/YourUsername/AMM-Volume-Bot.git
   ```

2. Navigate to the project directory:
   ```
   cd AMM-Volume-Bot
   ```

3. Install dependencies:
   ```
   npm install
   ```

## ⚙️ Configuration

Create a `.env` file in the root directory of the project and configure it with your settings:

```env
# ========
# = NODE =
# ========
RPC_URL="Your_RPC_URL"

# =========
# = WALLET =
# =========
USER_ADDRESS="Your_Wallet_Address"
USER_PRIVATE_KEY="Your_Private_Key"

# =========
# = TOKEN =
# =========
TARGET_TOKEN="Token_Contract_Address"
WETH="Wrapped_Native_Token_Address"
ROUTER="DEX_Router_Address"

# ===========
# = TRADING =
# ===========
TX_DELAY_MIN=15  # Minimum delay between trades in minutes
TX_DELAY_MAX=35  # Maximum delay between trades in minutes
```

## 🚀 Deployment

### Local Deployment

Run the bot locally using:
```bash
npm start
```

### Railway Deployment (Recommended)

1. Create an account on [Railway.app](https://railway.app/)
2. Connect your GitHub account
3. Create a new project and select "Deploy from GitHub repo"
4. Select your AMM-Volume-Bot repository
5. Add the following environment variables in Railway dashboard:
   - USER_ADDRESS
   - USER_PRIVATE_KEY
   - RPC_URL
   - TARGET_TOKEN
   - WETH
   - ROUTER
   - TX_DELAY_MIN
   - TX_DELAY_MAX
6. Railway will automatically deploy your bot

⚠️ **Security Note**: Never share your private key. Use a dedicated wallet with only the necessary funds for trading.

## 📈 Trading Strategy

The bot implements a simple but effective trading strategy:
1. Executes buys and sells at random intervals (15-35 minutes)
2. Uses small trade amounts to minimize price impact
3. Maintains persistent state to resume operations after restarts
4. Implements retry mechanism for failed transactions
5. Logs all operations for monitoring

## 🔍 Monitoring

- Check the Railway.app dashboard for logs and performance
- Enable email notifications for important events
- Use Telegram notifications for real-time updates
- Monitor the `next.json` file for scheduling information

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check [issues page](https://github.com/YourUsername/AMM-Volume-Bot/issues).

## 👏 Acknowledgements

- Original concept by [AzureKn1ght](https://github.com/AzureKn1ght/AMM-Volume-Bot)
- Built with [ethers.js](https://docs.ethers.io/)
- Scheduling powered by [node-schedule](https://github.com/node-schedule/node-schedule)
- Gaussian distribution implemented with [gaussian](https://github.com/errcw/gaussian)

---

Happy trading! 🚀📈