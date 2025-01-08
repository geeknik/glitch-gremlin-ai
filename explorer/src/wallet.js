export async function initWallet(wallets, connection) {
    // Store wallets globally
    window.wallets = wallets;
    
    // Store connection globally
    window.connection = connection;

    // Initialize wallet connection logic
    const connectButton = document.getElementById('connectWallet');
    const walletInfo = document.getElementById('walletInfo');
    const walletAddress = document.getElementById('walletAddress');
    const walletBalance = document.getElementById('walletBalance');

    if (connectButton) {
        connectButton.addEventListener('click', async () => {
            try {
                const wallet = wallets.find(w => w.available);
                if (!wallet) {
                    throw new Error('No wallet found');
                }
                
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
                alert('Wallet connection failed. Please try again.');
            }
        });
    }
}
