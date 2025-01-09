import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import nodePolyfills from 'rollup-plugin-node-polyfills'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      // Polyfill Node.js globals
      buffer: resolve(__dirname, 'node_modules/rollup-plugin-node-polyfills/polyfills/buffer-es6'),
      process: resolve(__dirname, 'node_modules/rollup-plugin-node-polyfills/polyfills/process-es6'),
      util: resolve(__dirname, 'node_modules/rollup-plugin-node-polyfills/polyfills/util'),
      sys: resolve(__dirname, 'node_modules/rollup-plugin-node-polyfills/polyfills/sys'),
      events: resolve(__dirname, 'node_modules/rollup-plugin-node-polyfills/polyfills/events'),
      stream: resolve(__dirname, 'node_modules/rollup-plugin-node-polyfills/polyfills/stream'),
      path: resolve(__dirname, 'node_modules/rollup-plugin-node-polyfills/polyfills/path'),
      querystring: resolve(__dirname, 'node_modules/rollup-plugin-node-polyfills/polyfills/qs'),
      punycode: resolve(__dirname, 'node_modules/rollup-plugin-node-polyfills/polyfills/punycode'),
      url: resolve(__dirname, 'node_modules/rollup-plugin-node-polyfills/polyfills/url'),
      string_decoder: resolve(__dirname, 'node_modules/rollup-plugin-node-polyfills/polyfills/string-decoder'),
      http: resolve(__dirname, 'node_modules/rollup-plugin-node-polyfills/polyfills/http'),
      https: resolve(__dirname, 'node_modules/rollup-plugin-node-polyfills/polyfills/http'),
      os: resolve(__dirname, 'node_modules/rollup-plugin-node-polyfills/polyfills/os'),
      assert: resolve(__dirname, 'node_modules/rollup-plugin-node-polyfills/polyfills/assert'),
      constants: resolve(__dirname, 'node_modules/rollup-plugin-node-polyfills/polyfills/constants'),
      _stream_duplex: resolve(__dirname, 'node_modules/rollup-plugin-node-polyfills/polyfills/readable-stream/duplex'),
      _stream_passthrough: resolve(__dirname, 'node_modules/rollup-plugin-node-polyfills/polyfills/readable-stream/passthrough'),
      _stream_readable: resolve(__dirname, 'node_modules/rollup-plugin-node-polyfills/polyfills/readable-stream/readable'),
      _stream_writable: resolve(__dirname, 'node_modules/rollup-plugin-node-polyfills/polyfills/readable-stream/writable'),
      _stream_transform: resolve(__dirname, 'node_modules/rollup-plugin-node-polyfills/polyfills/readable-stream/transform'),
    }
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
      plugins: [nodePolyfills()],
      external: ['ioredis']
    },
    commonjsOptions: {
      include: [/node_modules/],
      transformMixedEsModules: true
    }
  }
})
