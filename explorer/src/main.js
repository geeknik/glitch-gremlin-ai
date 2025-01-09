import { createApp } from 'vue'
import App from './App.vue'
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets'
import { initWalletStore } from '@solana/wallet-adapter-vue'
import { clusterApiUrl, Connection } from '@solana/web3.js'
import { initWallet } from './wallet.js'

// Create Vue app
const app = createApp(App)

// Setup Solana network connection
const network = WalletAdapterNetwork.Devnet
const endpoint = clusterApiUrl(network)
const connection = new Connection(endpoint)

// Initialize wallet store with supported wallet adapters
const wallets = [
  new PhantomWalletAdapter(),
  new SolflareWalletAdapter()
]

// Initialize wallet store
initWalletStore({
  wallets,
  autoConnect: false,
  network,
  endpoint,
  onError: (error) => {
    console.error('Wallet error:', error)
  }
})

// Mount app
app.mount('#app')
