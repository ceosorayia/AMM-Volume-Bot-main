const { ethers } = require('ethers');
require('dotenv').config();

// ABI minimal pour l'approbation
const tokenABI = [
    {
        "constant": false,
        "inputs": [
            {
                "name": "_spender",
                "type": "address"
            },
            {
                "name": "_value",
                "type": "uint256"
            }
        ],
        "name": "approve",
        "outputs": [
            {
                "name": "",
                "type": "bool"
            }
        ],
        "payable": false,
        "stateMutability": "nonpayable",
        "type": "function"
    }
];

async function approveToken() {
    try {
        console.log('Connexion au réseau BSC...');
        const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
        const wallet = new ethers.Wallet(process.env.USER_PRIVATE_KEY, provider);
        
        console.log('Création du contrat...');
        const tokenContract = new ethers.Contract(process.env.TARGET_TOKEN, tokenABI, wallet);
        
        // Montant maximum d'approbation
        const maxAmount = ethers.MaxUint256;
        
        console.log('Envoi de la transaction d\'approbation...');
        const tx = await tokenContract.approve(process.env.ROUTER, maxAmount, {
            gasLimit: 100000,
            gasPrice: ethers.parseUnits('5', 'gwei')
        });
        
        console.log('Transaction envoyée:', tx.hash);
        console.log('Attente de la confirmation...');
        
        const receipt = await tx.wait();
        console.log('✅ Token approuvé avec succès !');
        console.log('Hash de la transaction:', receipt.hash);
        
    } catch (error) {
        console.error('Erreur:', error.message);
        if (error.data) {
            console.error('Détails:', error.data);
        }
    }
}

// Exécution
approveToken();
