-- 041_employment_status.sql
-- 트레이너 재직/퇴사 상태 관리 (Soft Delete)
-- gym_id는 영구 보존하여 수업 기록·정산 데이터 고아화 방지

ALTER TABLE trainers
  ADD COLUMN IF NOT EXISTS employment_status TEXT NOT NULL DEFAULT 'active'
    CHECK (employment_status IN ('active', 'resigned'));

-- 기존 데이터 전부 active 처리
UPDATE trainers SET employment_status = 'active'
  WHERE employment_status IS DISTINCT FROM 'active';

-- 재직 상태 조회 성능 인덱스
CREATE INDEX IF NOT EXISTS idx_trainers_employment
  ON trainers (gym_id, employment_status);

COMMENT ON COLUMN trainers.employment_status IS
  'active = 재직 중, resigned = 퇴사 처리 (gym_id 보존, 이력 데이터 유지)';
