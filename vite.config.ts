import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/u2u_morphseg/',
  plugins: [
    react(),
    tailwindcss()
  ],
  publicDir: 'public'
})
