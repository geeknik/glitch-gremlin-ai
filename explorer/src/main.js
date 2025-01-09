import { createApp } from 'vue'
import App from './App.vue'
import { initWallet } from './wallet.js'
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets'
import { Connection, clusterApiUrl } from '@solana/web3.js'

// Initialize connection
const connection = new Connection(clusterApiUrl('devnet'), 'confirmed')

// Initialize wallet adapters with proper config
const wallets = [
  new PhantomWalletAdapter({ network: 'devnet' })
]

// Create Vue app
const app = createApp(App)

// Initialize wallet after app creation
app.mount('#app')
initWallet(wallets, connection)
