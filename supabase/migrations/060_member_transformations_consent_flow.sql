-- 060_member_transformations_consent_flow.sql
-- 비포애프터 동의 흐름 재설계:
--   트레이너가 업로드 → 회원이 회원 앱에서 1탭 동의/거부 → 동의 시 공개.
--   (이전: 회원이 직접 업로드. 번거로움 ↓ + 회원 본인 동의 기록 유지)
--
-- 변경:
--   1) status CHECK 에 'pending' / 'declined' 추가 (호환 위해 draft/revoked 도 유지)
--   2) expires_at 컬럼 추가 (트레이너 업로드 시 7일 후 자동 만료 안내)
--   3) 트레이너 INSERT RLS 추가 (자기 회원에 대해)
--
-- 모두 추가/완화 → 기존 데이터 영향 0.

-- 1. status 확장
ALTER TABLE member_transformations DROP CONSTRAINT IF EXISTS member_transformations_status_check;
ALTER TABLE member_transformations ADD CONSTRAINT member_transformations_status_check
  CHECK (status IN ('pending','published','declined','draft','revoked'));

-- 2. 만료 시각 (트레이너 업로드 시 now()+7days 로 설정 — 안내용)
ALTER TABLE member_transformations ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- 3. 트레이너가 자기 회원에 대해 INSERT 허용 (업로드 → pending)
DROP POLICY IF EXISTS "mt_trainer_insert" ON member_transformations;
CREATE POLICY "mt_trainer_insert" ON member_transformations
  FOR INSERT TO authenticated
  WITH CHECK (trainer_id IN (SELECT id FROM trainers WHERE auth_id = auth.uid()));

-- 4. (선택, 후속) cron/Edge Function 으로 pending + expires_at < now → 'declined' 자동 처리.
--    MVP: 공개 RLS 가 status='published' 만 통과시키므로, 만료된 pending 은 자연 비공개.
