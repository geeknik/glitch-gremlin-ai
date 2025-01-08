import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag.startsWith('solana-')
        }
      }
    })
  ],
  server: {
    port: 5173,
    open: true,
    strictPort: true,
    hmr: {
      overlay: false
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsInclude: ['**/*.js', '**/*.html']
  },
  optimizeDeps: {
    include: [
      '@solana/web3.js',
      '@solana/wallet-adapter-wallets', 
      '@solana/wallet-adapter-base',
      'vue'
    ]
  }
});
