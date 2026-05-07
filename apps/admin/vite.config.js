import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// admin 앱은 react-router-dom 을 사용하지 않는 단일-컴포넌트 SPA.
// chart.js / jspdf / xlsx / @ffmpeg/* 의존성도 없음 (분리 후 admin 번들이 가장 가벼움).
//
// envDir 로 모노레포 루트의 .env 를 공유 — 분리(별도 repo) 시 envDir 빼고
// 자체 .env 만 두면 됨.
export default defineConfig({
  plugins: [react()],
  envDir: resolve(__dirname, '../..'),
  server: {
    port: 3010,
    open: true,
  },
})
