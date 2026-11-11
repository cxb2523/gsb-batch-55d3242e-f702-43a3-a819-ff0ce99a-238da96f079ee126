import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// electron-vite 6 externalizes main and preload dependencies by default (build.externalizeDeps).
export default defineConfig({
  main: {},
  preload: {
    build: {
      rollupOptions: {
        output: {
          entryFileNames: '[name].js',
          format: 'cjs'
        }
      }
    }
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    }
  }
})
