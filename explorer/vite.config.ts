import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      // Polyfill Node.js globals
      buffer: 'rollup-plugin-node-polyfills/polyfills/buffer-es6',
      process: 'rollup-plugin-node-polyfills/polyfills/process-es6'
    }
  },
  optimizeDeps: {
    exclude: [
      'ioredis', // Exclude Redis from client bundle
      '@mapbox/node-pre-gyp'
    ]
  },
  build: {
    rollupOptions: {
      external: ['ioredis'] // Ensure Redis is not bundled
    },
    commonjsOptions: {
      include: [/node_modules/],
      transformMixedEsModules: true
    }
  }
})
