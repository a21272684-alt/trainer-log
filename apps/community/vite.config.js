import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// 커뮤니티 앱 — 웹 전용 (community.ownapp.kr). iOS/안드로이드 앱(portal)과 분리해
// 광고·결제 등 수익화가 앱 심사와 무관하게 동작하도록 함.
//
// envDir 로 모노레포 루트 .env 공유. 분리(별도 repo) 시 envDir 빼고 자체 .env 만 두면 됨.
export default defineConfig({
  plugins: [react()],
  envDir: resolve(__dirname, '../..'),
  server: {
    port: 3040,
    open: true,
  },
})
