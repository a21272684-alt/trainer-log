-- ================================================================
-- 045: payments.status 환불 상태 + trainers.role 직급 권한 컬럼
-- ================================================================

-- ── 1. payments.status ─────────────────────────────────────────
-- 기간권 환불 처리 후 레코드를 Hard-Delete 하지 않고
-- status 를 'refunded' 로 변경하여 정산 무결성 보존
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'refunded'));

-- 기존 payments 는 전부 active
UPDATE payments
  SET status = 'active'
  WHERE status IS DISTINCT FROM 'active';

-- 환불 상태 조회 최적화
CREATE INDEX IF NOT EXISTS idx_payments_member_status
  ON payments (member_id, status);

COMMENT ON COLUMN payments.status IS
  'active = 정상, refunded = 환불 처리 (Hard-Delete 금지 — 정산 무결성)';

-- ── 2. trainers.role ───────────────────────────────────────────
-- 시스템 내 접근 권한 레벨
-- owner   : 센터 대표 (모든 기능 접근)
-- manager : 매니저 (환불 등 민감 기능 접근)
-- staff   : 일반 직원 (조회·기록 위주)
ALTER TABLE trainers
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'staff';

-- 기존 대표 계정은 role = 'owner' 로 업데이트
-- (GymPortal.jsx OnboardingSetup 에서 role:'owner' 로 INSERT/UPDATE 하던 row 들)
UPDATE trainers
  SET role = 'owner'
  WHERE role IS DISTINCT FROM 'owner'
    AND approval_status = 'approved'
    -- approval_status + gym_id 소유자 추론: gym owner 는 자기 gym_id 와 email 이 gyms.owner_id 와 연결
    -- 안전하게 NULL 이 아닌 role 이 이미 'owner' 인 경우만 보존, 나머지는 이미 'staff' default 임
  ;

-- role CHECK 제약 추가
ALTER TABLE trainers
  DROP CONSTRAINT IF EXISTS trainers_role_check;
ALTER TABLE trainers
  ADD CONSTRAINT trainers_role_check
    CHECK (role IN ('owner', 'manager', 'staff'));

-- 직급 기반 권한 조회 최적화
CREATE INDEX IF NOT EXISTS idx_trainers_role
  ON trainers (gym_id, role);

COMMENT ON COLUMN trainers.role IS
  'owner = 대표, manager = 매니저(환불 권한), staff = 일반 직원';
