import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      stream: 'stream-browserify',
      buffer: 'buffer',
      util: 'util',
      process: 'process/browser',
    }
  },
  define: {
    'process.env': {},
    global: 'globalThis'
  },
  optimizeDeps: {
    exclude: ['ioredis'],
    esbuildOptions: {
      define: {
        global: 'globalThis'
      }
    }
  },
  build: {
    rollupOptions: {
      external: ['ioredis']
    },
    commonjsOptions: {
      include: [/node_modules/],
      transformMixedEsModules: true
    }
  }
})
