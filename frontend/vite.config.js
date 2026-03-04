import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path"
import { VitePWA } from 'vite-plugin-pwa' // <--- 1. Import the plugin

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    base: '/',
    define: {
      'import.meta.env.VITE_GOOGLE_MAPS_API_KEY': JSON.stringify(env.VITE_GOOGLE_MAPS_API_KEY),
    },
    plugins: [
      react(),
      // 2. Add and configure the PWA plugin
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'logo.png', 'pwa-192x192.png', 'pwa-512x512.png', 'offline.html'],
        manifest: {
          name: "T'aksi App",
          short_name: "T'aksi",
          description: "Georgia's smartest ride-hailing app",
          theme_color: '#000000',
          background_color: '#000000',
          display: 'standalone',
          scope: '/',
          start_url: '/',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png'
            }
          ]
        },
        workbox: {
          // Cache all the static assets
          globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
          // Force the offline.html to be the fallback for any navigation error
          runtimeCaching: [
            {
              urlPattern: ({ request }) => request.mode === 'navigate',
              handler: 'NetworkFirst', // Try network first, then fallback
              options: {
                cacheName: 'pages-cache',
                precacheFallback: {
                  fallbackURL: '/offline.html',
                },
              },
            },
          ],
        },
      })
    ],
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
          assetFileNames: 'assets/[name]-[hash].[ext]',
          manualChunks(id) {
            if (id.includes('node_modules')) {
              return 'vendor';
            }
            if (
              id.includes('/src/i18n/') || 
              id.includes('/src/config/') || 
              id.includes('LanguageContext') || 
              id.includes('AuthProvider')
            ) {
              return 'shared-core';
            }
          },
        }
      }
    }
  }
})