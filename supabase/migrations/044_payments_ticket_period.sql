-- ================================================================
-- 044: payments 테이블에 기간권 날짜 컬럼 + gym_product_id FK 추가
-- ================================================================
-- 목적: 헬스장 이용권(기간권) 등록 시 이어붙이기 로직 지원
--       start_date / end_date → 이용 시작·만료일
--       gym_product_id       → gym_products 테이블과의 정확한 FK
--
-- [하위 호환 보장]
-- - 모든 컬럼 NULL 허용 → TrainerApp 기존 결제 레코드 영향 없음
-- - 기존 payments row 는 세 컬럼 모두 NULL 유지
-- ================================================================

-- 1. 이용 시작일 (기간권에만 세팅)
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS start_date DATE DEFAULT NULL;

-- 2. 이용 만료일 (기간권에만 세팅)
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS end_date DATE DEFAULT NULL;

-- 3. gym_products FK (관리자 포털 결제 등록 시 세팅)
--    ON DELETE SET NULL: 상품이 삭제돼도 결제 기록은 보존
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS gym_product_id UUID
    REFERENCES gym_products(id) ON DELETE SET NULL;

-- ── 인덱스 ──────────────────────────────────────────────────────

-- 회원별 기간권 max(end_date) 조회 최적화
CREATE INDEX IF NOT EXISTS idx_payments_member_end_date
  ON payments (member_id, end_date)
  WHERE end_date IS NOT NULL;

-- gym_product_id 기준 조회 최적화
CREATE INDEX IF NOT EXISTS idx_payments_gym_product_id
  ON payments (gym_product_id)
  WHERE gym_product_id IS NOT NULL;
