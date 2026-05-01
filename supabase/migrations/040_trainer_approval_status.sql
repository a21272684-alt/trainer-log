-- 040_trainer_approval_status.sql
-- 트레이너 센터 가입 요청/승인 워크플로우를 위한 approval_status 컬럼 추가

ALTER TABLE trainers
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved'
    CHECK (approval_status IN ('pending', 'approved'));

-- 기존 gym_id 보유 트레이너는 모두 approved (하위 호환)
UPDATE trainers
  SET approval_status = 'approved'
  WHERE gym_id IS NOT NULL AND approval_status IS DISTINCT FROM 'approved';

-- gym_id 없는 트레이너는 approved (센터 미소속 상태)
UPDATE trainers
  SET approval_status = 'approved'
  WHERE gym_id IS NULL;

-- pending 트레이너 조회 성능을 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_trainers_approval
  ON trainers (gym_id, approval_status)
  WHERE approval_status = 'pending';

COMMENT ON COLUMN trainers.approval_status IS
  'pending = 가입 요청 대기 중, approved = 센터 소속 승인됨';
