import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
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
            // All node_modules → vendor chunks (prevents duplication)
            if (id.includes('node_modules')) {
              if (id.includes('react') || id.includes('react-dom')) {
                return 'vendor-react';
              }
              if (id.includes('firebase')) {
                return 'vendor-firebase';
              }
              return 'vendor-misc';
            }

            // Your shared src/ code MUST be in one chunk so context
            // instances are the same object across all entry points
            if (id.includes('/src/i18n/') || id.includes('LanguageContext')) {
              return 'shared-i18n';
            }
            if (id.includes('/src/config') || id.includes('AuthProvider')) {
              return 'shared-auth';
            }
            // Any other shared src/ utilities
            if (id.includes('/src/')) {
              return 'shared-app';
            }
          },
        }
      }
    }
  }
})