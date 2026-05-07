-- ================================================================
-- 047: members 테이블 — 가망 고객(Lead) 상태 + 메모 컬럼 추가
-- ================================================================

-- ── 1. members.status ─────────────────────────────────────────
-- lead    : 상담 중 가망 고객 (결제 전)
-- active  : 정식 등록 활성 회원
-- expired : 수강권 만료 비활성 회원
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('lead', 'active', 'expired'));

-- 기존 회원 데이터 전부 active 처리
UPDATE members
  SET status = 'active'
  WHERE status IS DISTINCT FROM 'active';

CREATE INDEX IF NOT EXISTS idx_members_gym_status
  ON members (gym_id, status);

COMMENT ON COLUMN members.status IS
  'lead = 상담 중 가망 고객, active = 활성 회원, expired = 만료 비활성';

-- ── 2. members.memo ────────────────────────────────────────────
-- 상담 메모, 운동 목적, 특이사항 등 자유 텍스트
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS lead_memo TEXT DEFAULT NULL;

COMMENT ON COLUMN members.lead_memo IS
  '상담 메모 / 가망 고객 상태 기록용 텍스트';

-- ── 3. payments INSERT 트리거 — lead → active 자동 전환 ───────
-- 비즈니스 룰: 가망 고객이 첫 결제 완료 순간 status = active 로 자동 전환
-- TrainerApp·관리자 포털 양쪽 모든 결제 경로에서 동작 보장

CREATE OR REPLACE FUNCTION fn_auto_activate_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.member_id IS NOT NULL THEN
    UPDATE members
      SET status = 'active'
      WHERE id     = NEW.member_id
        AND status = 'lead';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_activate_lead ON payments;
CREATE TRIGGER trg_auto_activate_lead
  AFTER INSERT ON payments
  FOR EACH ROW
  EXECUTE FUNCTION fn_auto_activate_lead();

COMMENT ON FUNCTION fn_auto_activate_lead IS
  'payments INSERT 시 해당 회원이 lead 상태이면 active 로 자동 전환';
