const { ethers } = require('ethers');
require('dotenv').config();

async function checkBalance() {
    try {
        const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
        const balance = await provider.getBalance(process.env.USER_ADDRESS);
        console.log(`Solde BNB: ${ethers.formatEther(balance)} BNB`);
    } catch (error) {
        console.error('Erreur:', error.message);
    }
}

checkBalance();
