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
      // Add these to handle problematic imports
      'mock-aws-s3': false,
      'aws-sdk': false,
      'nock': false
    }
  },
  define: {
    'process.env': {},
    global: 'globalThis'
  },
  optimizeDeps: {
    exclude: ['ioredis', '@mapbox/node-pre-gyp'],
    esbuildOptions: {
      define: {
        global: 'globalThis'
      }
    }
  },
  build: {
    rollupOptions: {
      external: [
        'ioredis',
        '@mapbox/node-pre-gyp',
        'mock-aws-s3',
        'aws-sdk',
        'nock'
      ]
    },
    commonjsOptions: {
      include: [/node_modules/],
      transformMixedEsModules: true
    }
  }
})
