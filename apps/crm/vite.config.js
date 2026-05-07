import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// CRM 앱 — react-router-dom + jspdf + xlsx 사용 (정산/리포트 PDF·엑셀).
// chart.js / @ffmpeg/* 의존성 없음.
//
// envDir 로 모노레포 루트 .env 공유. 분리(별도 repo) 시 envDir 빼고 자체 .env 만 두면 됨.
export default defineConfig({
  plugins: [react()],
  envDir: resolve(__dirname, '../..'),
  server: {
    port: 3020,
    open: true,
  },
})
