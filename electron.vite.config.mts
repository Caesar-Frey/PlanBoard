import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

export default defineConfig({
  main: {
    build: {
      // Everything in package.json "dependencies" stays a runtime require(), not bundled.
      // better-sqlite3 must stay external because it loads a native .node binary.
      externalizeDeps: true,
      rollupOptions: { external: ['better-sqlite3'] }
    }
  },
  preload: {
    build: {
      // Sandboxed preloads must be a single CommonJS file that only requires 'electron'.
      externalizeDeps: true
    }
  },
  renderer: {
    root: resolve(import.meta.dirname, 'src/renderer'),
    plugins: [react()],
    build: {
      rollupOptions: { input: resolve(import.meta.dirname, 'src/renderer/index.html') }
    }
  }
})
