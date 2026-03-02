import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:4000',
      // Socket.IO: in dev the app connects directly to the backend (see io(socketUrl) in components).
      // No /socket.io proxy to avoid ws proxy EPIPE/ECONNRESET when the backend closes connections.
    }
  }
})
