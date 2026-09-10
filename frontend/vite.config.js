import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('@mui/x-data-grid')) return 'mui-data-grid'
          if (id.includes('@mui/icons-material')) return 'mui-icons'
          if (id.includes('@mui/material') || id.includes('@mui/system') || id.includes('@mui/base')) return 'mui'
          if (id.includes('@tanstack')) return 'tanstack'
          return 'vendor'
        },
      },
    },
  },
  server: {
    port: 5173,
  },
})
