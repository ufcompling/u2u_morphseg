import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: '0.0.0.0', // Allow connections from outside the container
    port: 5173,
    strictPort: true,
    hmr: {
      clientPort: 5173, // Ensures the browser connects to the correct host port
    },
    watch: {
      usePolling: true, // Needed for HMR to work with Docker volumes
    }
  },
  base: '/u2u_morphseg/',
  plugins: [
    react(),
    tailwindcss()
  ],
})
