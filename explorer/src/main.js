import { createApp } from 'vue'
import App from './App.vue'
import { initWallet } from './wallet.js'
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets'
import { Connection } from '@solana/web3.js'

// Initialize wallet adapters
const wallets = [
  new PhantomWalletAdapter()
]

// Initialize connection
const connection = new Connection('https://api.mainnet-beta.solana.com')

// Initialize wallet
initWallet(wallets, connection)

// Create Vue app
const app = createApp(App)
app.mount('#app')
