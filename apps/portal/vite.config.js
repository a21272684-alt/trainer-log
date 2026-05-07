import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Portal 앱 — Trainer/Member/Community/Landing/Report/정책 페이지 통합.
// chart.js + @ffmpeg/* 사용 (Member 의 영상 처리). FFmpeg.wasm 은 SharedArrayBuffer 필요 → COOP/COEP 헤더 필수.
//
// envDir 로 모노레포 루트 .env 공유. 분리(별도 repo) 시 envDir 빼고 자체 .env 만 두면 됨.
export default defineConfig({
  plugins: [react()],
  envDir: resolve(__dirname, '../..'),
  server: {
    port: 3030,
    open: true,
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
  },
})
