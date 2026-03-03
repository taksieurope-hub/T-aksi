import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    define: {
      'import.meta.env.VITE_GOOGLE_MAPS_API_KEY': JSON.stringify(env.VITE_GOOGLE_MAPS_API_KEY),
    },

    plugins: [
      react()
      // PWA removed to stop build crashes
    ],

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },

    build: {
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          rider: path.resolve(__dirname, 'rider/index.html'),
          driver: path.resolve(__dirname, 'driver/index.html'),
          admin: path.resolve(__dirname, 'admin/index.html'),
        },
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              return 'vendor';
            }
            if (id.includes('RiderPortal')) return 'portal-rider';
            if (id.includes('DriverPortal')) return 'portal-driver';
            if (id.includes('AdminPortal')) return 'portal-admin';
          }
        }
      }
    }
  }
})