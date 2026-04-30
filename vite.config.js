import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main:  resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
      }
    }
  },
  server: {
    port: 3000,
    open: true,
    // FFmpeg.wasm requires SharedArrayBuffer → COOP/COEP headers mandatory
    // Note: COOP: same-origin blocks window.opener (OAuth popup flow).
    //       If Google/Kakao OAuth uses redirect (not popup), no issue.
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  }
})
