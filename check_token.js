const { ethers } = require('ethers');
require('dotenv').config();

const tokenABI = [
    {
        "constant": true,
        "inputs": [],
        "name": "name",
        "outputs": [{"name": "", "type": "string"}],
        "payable": false,
        "stateMutability": "view",
        "type": "function"
    },
    {
        "constant": true,
        "inputs": [],
        "name": "symbol",
        "outputs": [{"name": "", "type": "string"}],
        "payable": false,
        "stateMutability": "view",
        "type": "function"
    },
    {
        "constant": true,
        "inputs": [],
        "name": "decimals",
        "outputs": [{"name": "", "type": "uint8"}],
        "payable": false,
        "stateMutability": "view",
        "type": "function"
    },
    {
        "constant": true,
        "inputs": [{"name": "_owner", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"name": "balance", "type": "uint256"}],
        "payable": false,
        "stateMutability": "view",
        "type": "function"
    }
];

async function checkToken() {
    try {
        console.log('Connexion au réseau BSC...');
        const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
        const wallet = new ethers.Wallet(process.env.USER_PRIVATE_KEY, provider);
        
        console.log('Vérification du token...');
        const tokenContract = new ethers.Contract(process.env.TARGET_TOKEN, tokenABI, wallet);
        
        console.log('Récupération des informations du token...');
        
        try {
            const name = await tokenContract.name();
            console.log(`Nom: ${name}`);
        } catch (e) {
            console.log('Nom: Non disponible');
        }
        
        try {
            const symbol = await tokenContract.symbol();
            console.log(`Symbole: ${symbol}`);
        } catch (e) {
            console.log('Symbole: Non disponible');
        }
        
        try {
            const decimals = await tokenContract.decimals();
            console.log(`Décimales: ${decimals}`);
        } catch (e) {
            console.log('Décimales: 18 (par défaut)');
        }
        
        try {
            const balance = await tokenContract.balanceOf(process.env.USER_ADDRESS);
            console.log(`Balance: ${ethers.formatUnits(balance, 18)}`);
        } catch (e) {
            console.log('Balance: Non disponible');
        }
        
    } catch (error) {
        console.error('❌ Erreur:', error.message);
        if (error.data) {
            console.error('Détails:', error.data);
        }
    }
}

// Exécution
checkToken();
