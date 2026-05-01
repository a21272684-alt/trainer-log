-- 042_rental_fees.sql
-- 대관 트레이너 대관료 납부 내역 테이블
--
-- 설계 원칙:
--   • rental_fees = 트레이너가 센터에 실제 납부(입금)한 기록
--   • 청구액은 trainers.settlement_config(JSONB) 에서 실시간 계산
--     - rental_fee_type = 'fixed'      → 고정 monthly 금액
--     - rental_fee_type = 'per_session'→ 이달 완료 수업 수 × rental_fee_amount
--   • target_month = 'YYYY-MM' 형식으로 월별 집계 기준
--
-- settlement_config JSONB 확장 (trainers 테이블, 별도 ALTER 불필요)
-- {
--   "payment_managed_by": "center" | "self",
--   "rental_fee_type":    "fixed"  | "per_session",
--   "rental_fee_amount":  number
-- }

CREATE TABLE IF NOT EXISTS rental_fees (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id       uuid        NOT NULL REFERENCES gyms(id)     ON DELETE CASCADE,
  trainer_id   uuid        NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  amount       integer     NOT NULL CHECK (amount >= 0),
  paid_at      timestamptz NOT NULL DEFAULT now(),
  target_month text        NOT NULL CHECK (target_month ~ '^\d{4}-\d{2}$'),  -- 'YYYY-MM'
  memo         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  rental_fees                IS '대관 트레이너가 센터에 납부한 대관료 실납부 내역';
COMMENT ON COLUMN rental_fees.target_month   IS '정산 대상 월 (YYYY-MM 형식)';
COMMENT ON COLUMN rental_fees.amount         IS '실제 납부 금액 (원)';
COMMENT ON COLUMN rental_fees.memo           IS '입금 확인 메모 (현금, 계좌이체 등)';

-- 월별 조회 성능 인덱스
CREATE INDEX IF NOT EXISTS idx_rental_fees_gym_month
  ON rental_fees (gym_id, target_month);

CREATE INDEX IF NOT EXISTS idx_rental_fees_trainer_month
  ON rental_fees (trainer_id, target_month);

-- RLS
ALTER TABLE rental_fees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rental_fees_all" ON rental_fees
  FOR ALL USING (true) WITH CHECK (true);
