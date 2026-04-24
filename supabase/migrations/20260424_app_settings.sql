-- app_settings: 앱 전역 설정 (플랜 안내 등)
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 기본 플랜 데이터 삽입
INSERT INTO app_settings (key, value) VALUES
(
  'plan_guide_visible',
  'true'::jsonb
),
(
  'plans',
  '[
    {
      "id": "free",
      "name": "Free",
      "price": "무료",
      "color": "#9ca3af",
      "highlight": false,
      "current": true,
      "badge": null,
      "features": ["회원 5명", "AI 일지 월 20회", "식단 기록", "기본 통계"]
    },
    {
      "id": "pro",
      "name": "Pro",
      "price": "₩9,900/월",
      "color": "#60a5fa",
      "highlight": false,
      "current": false,
      "badge": "출시 예정",
      "features": ["회원 무제한", "AI 일지 무제한", "주간 리포트 AI", "매출 분석"]
    },
    {
      "id": "premium",
      "name": "Premium",
      "price": "₩19,900/월",
      "color": "#c8f135",
      "highlight": true,
      "current": false,
      "badge": "출시 예정",
      "features": ["Pro 전체 포함", "루틴 마켓 무제한", "카카오 자동 발송", "우선 지원"]
    }
  ]'::jsonb
)
ON CONFLICT (key) DO NOTHING;
