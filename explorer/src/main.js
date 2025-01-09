import { createApp } from 'vue'
import App from './App.vue'
import { initWallet } from './wallet.js'
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets'
import { Connection } from '@solana/web3.js'

// Initialize connection
const connection = new Connection('https://api.devnet.solana.com', { commitment: 'confirmed' })

// Initialize wallet adapters with proper config
const wallets = [
  new PhantomWalletAdapter({ network: 'devnet' })
]

// Create Vue app
const app = createApp(App)

// Pass wallet state to app
app.config.globalProperties.$wallets = wallets
app.config.globalProperties.$connection = connection

// Mount app first
app.mount('#app')

// Then initialize wallet
try {
  await initWallet(wallets, connection)
} catch (error) {
  console.error('Failed to initialize wallet:', error)
}
