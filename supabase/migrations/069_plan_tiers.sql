-- 069_plan_tiers.sql
-- 유료 권한을 2단계(free/paid) → 3단계(free/pro/premium) 로 확장.
--
-- 배경:
--   기존엔 "활성 구독 있으면 = 모든 유료 기능" 이진 모델. 관리자가 Pro/Premium
--   차등 권한을 줄 수 없었음. feature_gates 를 3단계로, 구독 plan → 티어 매핑.
--
-- 안전(강등 방지):
--   트레이너 앱은 구독 plan='pro' → pro, 그 외 유료값(basic/business/paid 등) → premium
--   으로 매핑. 아래 1) 로 기존 활성 구독을 모두 premium 으로 표준화해 기존 유료
--   회원이 절대 강등되지 않게 함. 이후 신규 구독만 admin 에서 Pro/Premium 선택.

-- 1) 기존 활성 구독 → premium (전체 개방 유지 = 강등 방지)
UPDATE subscriptions
SET plan = 'premium'
WHERE valid_until > now()
  AND plan IS DISTINCT FROM 'premium';

-- 2) feature_gates 를 3단계로 설정 (제안 기본 분류; admin 기능 게이트에서 이후 토글 가능)
--    Pro 전용 OFF: 정산 분석(settlement)·AI 인사이트(ai_insight)·Web Push(push_notif)
--    나머지 유료 핵심은 Pro/Premium 공통. Free 는 기존 그대로.
INSERT INTO app_settings (key, value)
VALUES ('feature_gates', '{
  "free":    {"ai_journal":false,"history_tab":true,"revenue_tab":false,"settlement":false,"weekly_report":false,"ai_insight":false,"risk_analysis":false,"push_notif":false,"schedule_tab":true,"diet_view":true,"member_limit":5},
  "pro":     {"ai_journal":true,"history_tab":true,"revenue_tab":true,"settlement":false,"weekly_report":true,"ai_insight":false,"risk_analysis":true,"push_notif":false,"schedule_tab":true,"diet_view":true,"member_limit":9999},
  "premium": {"ai_journal":true,"history_tab":true,"revenue_tab":true,"settlement":true,"weekly_report":true,"ai_insight":true,"risk_analysis":true,"push_notif":true,"schedule_tab":true,"diet_view":true,"member_limit":9999}
}'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- 참고: 코드(트레이너앱/admin)의 DEFAULT 게이트도 동일한 3단계라, app_settings 에
-- feature_gates 행이 없어도 동작함. 이 마이그는 저장값을 명시적으로 3단계로 맞추는 목적.
