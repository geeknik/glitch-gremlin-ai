export async function initWallet(wallets, connection) {
    if (!wallets || !connection) {
        throw new Error('Wallet adapters or connection not provided');
    }

    // Initialize wallet store with connection
    const store = {
        wallets,
        connection,
        connected: false,
        publicKey: null
    };

    // Make store reactive for Vue
    const app = document.querySelector('#app')?.__vue_app__;
    if (!app) {
        throw new Error('Vue app not initialized');
    }

    app.config.globalProperties.$wallet = store;

    // Initialize wallet connection logic
    const connectButton = document.getElementById('connectWallet');
    const walletInfo = document.getElementById('walletInfo');
    const walletAddress = document.getElementById('walletAddress');
    const walletBalance = document.getElementById('walletBalance');

    if (connectButton) {
        connectButton.addEventListener('click', async () => {
            try {
                if (!wallets || wallets.length === 0) {
                    console.error('No wallet adapters provided');
                    throw new Error('No wallet adapters configured');
                }

                const availableWallets = wallets.filter(w => w.available);
                if (availableWallets.length === 0) {
                    console.error('No available wallets found. Please install Phantom or Solflare.');
                    window.open('https://phantom.app', '_blank');
                    return;
                }
                
                // Use the first available wallet
                const wallet = availableWallets[0];
                await wallet.connect();
                
                if (!wallet.publicKey) {
                    throw new Error('Wallet connection failed - no public key');
                }

                // Update store
                app.config.globalProperties.$wallet.connected = true;
                app.config.globalProperties.$wallet.publicKey = wallet.publicKey;

                // Load governance data after successful connection
                await loadGovernanceData(wallet.publicKey, connection);
                
                if (!wallet.publicKey) {
                    throw new Error('Failed to connect wallet');
                }

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
                alert('Failed to connect wallet. Please try again.');
            }
        });
    }
}

async function loadGovernanceData(publicKey, connection) {
    try {
        // Load user's governance state
        const governanceState = await connection.getAccountInfo(publicKey);
        if (!governanceState) {
            console.log('No existing governance state found');
            return;
        }

        // Load active proposals
        const proposals = await connection.getProgramAccounts(
            new PublicKey('GremlinGov11111111111111111111111111111111111')
        );

        console.log('Governance data loaded:', {
            proposals: proposals.length
        });

        // Store in global state
        const app = document.querySelector('#app')?.__vue_app__;
        if (app) {
            app.config.globalProperties.$governance = {
                proposals,
                lastUpdated: Date.now()
            };
        }
    } catch (err) {
        console.error('Failed to load governance data:', err);
    }
}
