import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    }
  },
  define: {
    'global': 'globalThis',
    'process.env': process.env
  },
  server: {
    port: 5173,
    host: '127.0.0.1',
    strictPort: true,
    hmr: {
      protocol: 'ws',
      host: '127.0.0.1',
      port: 5173,
    },
  },
  build: {
    target: 'esnext',
    sourcemap: true,
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext',
      define: {
        global: 'globalThis'
      },
      platform: 'browser'
    }
  }
}) 