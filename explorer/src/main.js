import { createApp } from 'vue'
import App from './App.vue'
import { createAppKit } from '@reown/appkit-solana/vue'
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets'
import { SolanaAdapter } from '@reown/appkit-adapter-solana/vue'
import { solana, solanaDevnet } from '@reown/appkit/networks'

// Create Vue app
const app = createApp(App)

// Initialize AppKit
const projectId = process.env.REOWN_PROJECT_ID || 'b7ac4a521e713c53b38f134ba9d0fc8f'

const metadata = {
  name: 'Glitch Gremlin Explorer',
  description: 'Explore Glitch Gremlin chaos tests and governance',
  url: window.location.origin,
  icons: ['https://glitchgremlin.ai/logo.png']
}

// Create Solana adapter
const solanaAdapter = new SolanaAdapter({
  wallets: [new PhantomWalletAdapter(), new SolflareWalletAdapter()]
})

// Initialize AppKit
createAppKit({
  adapters: [solanaAdapter],
  metadata,
  networks: [solana, solanaDevnet],
  projectId,
  wallets: [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter()
  ]
})

// Mount app
app.mount('#app')
