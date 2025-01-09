export async function initWallet(wallets, connection) {
    if (!wallets || !connection) {
        throw new Error('Wallet adapters or connection not provided');
    }

    // Store in Vue global properties instead of window
    const app = document.querySelector('#app')?.__vue_app__;
    if (!app) {
        throw new Error('Vue app not initialized');
    }

    app.config.globalProperties.$wallets = wallets;
    app.config.globalProperties.$connection = connection;

    // Initialize wallet connection logic
    const connectButton = document.getElementById('connectWallet');
    const walletInfo = document.getElementById('walletInfo');
    const walletAddress = document.getElementById('walletAddress');
    const walletBalance = document.getElementById('walletBalance');

    if (connectButton) {
        connectButton.addEventListener('click', async () => {
            try {
                const availableWallets = wallets.filter(w => w.available);
                if (availableWallets.length === 0) {
                    throw new Error('No wallet found. Please install a supported wallet like Phantom.');
                }
                
                // Use the first available wallet
                const wallet = availableWallets[0];
                await wallet.connect();
                const publicKey = wallet.publicKey;
                
                // Update UI
                if (walletInfo) walletInfo.classList.remove('hidden');
                if (walletAddress) walletAddress.textContent = publicKey.toBase58().slice(0, 6) + '...' + publicKey.toBase58().slice(-4);
                
                // Get balance
                const balance = await connection.getBalance(publicKey);
                if (walletBalance) walletBalance.textContent = (balance / 1e9).toFixed(2);

                // Load governance data
                loadGovernanceData();
            } catch (error) {
                console.error('Wallet connection failed:', error);
                alert(`Wallet connection failed: ${error.message}`);
            }
        });
    }
}

function loadGovernanceData() {
    // Placeholder for governance data loading
    console.log('Loading governance data...');
}
