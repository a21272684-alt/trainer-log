-- ── 정산 고용형태 확장 ────────────────────────────────────────────────────────
-- trainers 테이블에 고용형태 + 정산 설정 컬럼 추가

ALTER TABLE trainers
  ADD COLUMN IF NOT EXISTS employment_type text DEFAULT 'employee'
    CHECK (employment_type IN ('rental','freelance','employee')),
  ADD COLUMN IF NOT EXISTS settlement_config jsonb NOT NULL DEFAULT '{}';

COMMENT ON COLUMN trainers.employment_type IS
  'rental=대관 트레이너, freelance=프리랜서, employee=정직원';

COMMENT ON COLUMN trainers.settlement_config IS
  '고용형태별 정산 설정 (JSON)
   rental    : { rental_fee, other_expenses }
   freelance : { commission_rate }
   employee  : { custom_grade, custom_base_salary, custom_incentive_rate, custom_deductions[] }
   공통      : { employment_type }';
