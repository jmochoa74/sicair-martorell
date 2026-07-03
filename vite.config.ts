import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
  base: '/sicair-martorell/',
  define: {
    'import.meta.env.VITE_GITHUB_TOKEN': JSON.stringify('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')
  }
})