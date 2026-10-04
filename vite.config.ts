import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative base so the static build works from any folder or static host.
  base: './',
  plugins: [react()],
})
