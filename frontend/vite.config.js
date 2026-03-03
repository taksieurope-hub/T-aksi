import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path"
import { VitePWA } from "vite-plugin-pwa"

export default defineConfig(({ mode }) => {
  // Pulls variables from Render's dashboard
  const env = loadEnv(mode, process.cwd(), '');

  return {
    define: {
      'import.meta.env.VITE_GOOGLE_MAPS_API_KEY': JSON.stringify(env.VITE_GOOGLE_MAPS_API_KEY),
    },

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
      },
      dedupe: ['react', 'react-dom', 'react-router', 'react-router-dom', 'scheduler'],
    },

    build: {
      modulePreload: false,
      sourcemap: false,
      chunkSizeWarningLimit: 700,
      minify: 'esbuild',
      target: 'esnext',
      rollupOptions: {
        // ── MPA ENTRY POINTS ──────────────────────────────────────────
        input: {
          main: path.resolve(__dirname, 'index.html'),
          rider: path.resolve(__dirname, 'rider/index.html'),
          driver: path.resolve(__dirname, 'driver/index.html'),
          admin: path.resolve(__dirname, 'admin/index.html'),
        },
        output: {
          manualChunks(id) {
            // ── Core React runtime ──────────────────────────────────────────
            if (
              id.includes('node_modules/react/') ||
              id.includes('node_modules/react-dom/') ||
              id.includes('node_modules/react-router') ||
              id.includes('node_modules/scheduler/')
            ) {
              return 'vendor-react';
            }

            // ── Radix UI + shadcn primitives ────────────────────────────────
            if (id.includes('node_modules/@radix-ui/')) {
              return 'vendor-ui';
            }

            // ── Firebase SDK ────────────────────────────────────────────────
            if (id.includes('node_modules/firebase/') || id.includes('node_modules/@firebase/')) {
              return 'vendor-firebase';
            }

            // ── Framer Motion ───────────────────────────────────────────────
            if (id.includes('node_modules/framer-motion/')) {
              return 'vendor-motion';
            }

            // ── PayPal SDK ──────────────────────────────────────────────────
            if (id.includes('node_modules/@paypal/')) {
              return 'vendor-paypal';
            }

            // ── Utility libs ────────────────────────────────────────────────
            if (
              id.includes('node_modules/axios/') ||
              id.includes('node_modules/clsx/') ||
              id.includes('node_modules/tailwind-merge/') ||
              id.includes('node_modules/class-variance-authority/') ||
              id.includes('node_modules/lucide-react/')
            ) {
              return 'vendor-utils';
            }

            // ── Portal chunks (ensures isolation) ───────────────────────────
            if (id.includes('/components/RiderPortal') || id.includes('/rider/'))   return 'portal-rider';
            if (id.includes('/components/DriverPortal') || id.includes('/driver/')) return 'portal-driver';
            if (id.includes('/components/AdminPortal') || id.includes('/admin/'))   return 'portal-admin';
          }
        }
      }
    },

    esbuild: {
      drop: mode === 'production' ? ['console', 'debugger'] : [],
    },
  }
})