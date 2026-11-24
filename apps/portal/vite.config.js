import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Portal 앱 — Trainer/Member/Community/Landing/Report/정책 페이지 통합.
// chart.js 사용. (예전 @ffmpeg/* 영상 처리는 제거됨 — 아래 COOP/COEP 헤더는 개발 서버용으로만 남아 있음)
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
      // 'require-corp' 는 외부 도메인 이미지(Supabase storage)를 CORP 헤더 없이는
      // 차단해 hold-photos / diet-photos 표시가 깨졌음. 'credentialless' 는 cookie
      // 없이 로드하면 허용 + SharedArrayBuffer (FFmpeg.wasm) 도 동작.
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
  build: {
    rollupOptions: {
      output: {
        // 잘 안 바뀌는 기본 부품(node_modules)은 따로 묶는다 — 앱 코드만 바뀐 배포에선 이 파일들을 휴대폰에 저장된 그대로 쓴다.
        // chart.js 는 회원 앱만 쓰므로 회원 앱을 열 때만 받는다.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('@sentry')) return 'sentry'
          if (id.includes('@supabase')) return 'supabase'
          if (id.includes('chart.js')) return 'chart'
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler|@remix-run)[\\/]/.test(id)) return 'react'
        },
      },
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      // 'require-corp' 는 외부 도메인 이미지(Supabase storage)를 CORP 헤더 없이는
      // 차단해 hold-photos / diet-photos 표시가 깨졌음. 'credentialless' 는 cookie
      // 없이 로드하면 허용 + SharedArrayBuffer (FFmpeg.wasm) 도 동작.
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
})
