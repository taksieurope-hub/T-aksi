import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    base: '/', 
    define: {
      'import.meta.env.VITE_GOOGLE_MAPS_API_KEY': JSON.stringify(env.VITE_GOOGLE_MAPS_API_KEY),
    },
    plugins: [react()],
    resolve: {
      alias: { "@": path.resolve(__dirname, "./src") },
    },
    build: {
      target: 'esnext',
      minify: 'esbuild',
      rollupOptions: {
        input: {
          main:   'index.html',
          rider:  'rider/index.html',
          driver: 'driver/index.html',
          admin:  'admin/index.html',
        },
        output: {
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js',

          // ── KEY FIX: Force shared code into ONE chunk ──────────────────
          // Without this, Rollup duplicates LanguageContext/AuthProvider
          // into each entry bundle → two React context instances → crash
          manualChunks(id) {
  // 1. ALL node_modules go into ONE vendor chunk. 
  // Do NOT split React from other dependencies; it breaks the scheduler.
  if (id.includes('node_modules')) {
    return 'vendor';
  }

  // 2. ALL shared logic (Context, Auth, i18n) goes into ONE core chunk.
  // This ensures there is exactly ONE instance of your Context providers.
  if (
    id.includes('/src/i18n/') || 
    id.includes('LanguageContext') || 
    id.includes('/src/config') || 
    id.includes('AuthProvider')
  ) {
    return 'shared-core';
  }
}
        }
      }
    }
  }
})