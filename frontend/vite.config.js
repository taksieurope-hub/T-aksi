import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path"
import { VitePWA } from "vite-plugin-pwa"

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      strategies: 'generateSW',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: "T'aksi App",
        short_name: "T'aksi",
        description: 'Ride-hailing for Georgia',
        theme_color: '#000000',
        background_color: '#000000',
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        lang: "ka",
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        globDirectory: 'dist',
        globIgnores: ['**/*.map'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/maps\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-maps-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /^https:\/\/t-aksi\.onrender\.com\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'taksi-api-cache',
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'firebase-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        skipWaiting: true,
        clientsClaim: true,
      },
      devOptions: {
        enabled: false,
        type: 'module'
      }
    })
  ],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // ── KEY FIX: force every package (including @paypal/react-paypal-js)
      // to resolve to the SAME React copy from your node_modules root.
      // Without this, paypal's bundled React is a different object instance,
      // causing the __SECRET_INTERNALS crash.
      "react":     path.resolve(__dirname, "node_modules/react"),
      "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
    },
    // Belt-and-suspenders: Vite will also deduplicate these at the module graph level
    dedupe: ['react', 'react-dom', 'react-router-dom'],
  },

  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // ── IMPORTANT: React and ReactDOM must ALWAYS land in the same chunk.
          // Never split react/react-dom across separate chunks — doing so creates
          // two module instances and breaks hooks + context (the PayPal crash).
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/scheduler/')
          ) {
            return 'vendor-react-core'
          }

          if (id.includes('node_modules')) {
            if (id.includes('firebase'))                              return 'vendor-firebase'
            if (id.includes('@googlemaps') || id.includes('google-maps')) return 'vendor-maps'
            // PayPal goes in its OWN chunk but will import react from vendor-react-core
            if (id.includes('paypal'))                                return 'vendor-paypal'
            // react-router in with react so context is shared
            if (id.includes('react-router'))                          return 'vendor-react-core'
            if (id.includes('@radix-ui'))                             return 'vendor-radix'
            return 'vendor-misc'
          }

          if (id.includes('/components/RiderPortal') || id.includes('/rider/'))   return 'portal-rider'
          if (id.includes('/components/DriverPortal') || id.includes('/driver/')) return 'portal-driver'
          if (id.includes('/components/AdminPortal') || id.includes('/admin/'))   return 'portal-admin'
        }
      }
    },
    chunkSizeWarningLimit: 600,
    minify: 'esbuild',
    target: 'esnext',
  },

  esbuild: {
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
  },
})