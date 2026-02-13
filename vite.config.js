import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    dedupe: ['three', 'web-ifc'],
  },
  optimizeDeps: {
    exclude: ['web-ifc'],
  },
  server: {
    port: 3000,
    open: true,
  },
})
