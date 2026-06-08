-- 065_trainer_schedule_sync.sql
-- 트레이너 스케줄(시간표 블록)을 localStorage → 서버 동기화로 전환.
--
-- 배경:
--   기존엔 blocks/알림 설정이 localStorage 에만 저장돼 기기·브라우저 교체/
--   캐시 삭제 시 데이터 손실. 다른 자원(회원·일지·결제)은 모두 서버라
--   일관성도 어긋남.
--
-- 설계:
--   - 행은 트레이너당 1개(trainer_id PK).
--   - blocks 는 jsonb 통째 보관 → 블록 내부 구조(id/type/memberId/cancelled
--     등)가 바뀌어도 마이그레이션 불필요. 작은 데이터(~수십 KB)라 통째 upsert OK.
--   - 알림 설정도 같이(스케줄과 한 묶음). 별도 행/테이블 안 만듦 = 유지보수 ↓.
--   - 클라는 localStorage 캐시 유지(오프라인 대응) + debounced 서버 upsert.

CREATE TABLE IF NOT EXISTS trainer_schedules (
  trainer_id    uuid PRIMARY KEY REFERENCES trainers(id) ON DELETE CASCADE,
  blocks        jsonb NOT NULL DEFAULT '[]'::jsonb,
  notif_enabled boolean NOT NULL DEFAULT false,
  notif_minutes integer NOT NULL DEFAULT 30 CHECK (notif_minutes >= 0),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE trainer_schedules ENABLE ROW LEVEL SECURITY;

-- 본인 행만 access (050 trainers 패턴과 동일)
DROP POLICY IF EXISTS "ts_owner_all" ON trainer_schedules;
CREATE POLICY "ts_owner_all" ON trainer_schedules
  FOR ALL TO authenticated
  USING      (trainer_id IN (SELECT id FROM trainers WHERE auth_id = auth.uid()))
  WITH CHECK (trainer_id IN (SELECT id FROM trainers WHERE auth_id = auth.uid()));
