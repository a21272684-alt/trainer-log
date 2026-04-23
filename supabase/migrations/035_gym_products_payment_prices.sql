-- ================================================================
-- 035_gym_products_payment_prices.sql
-- gym_products 테이블에 payment_prices JSONB 컬럼 추가
-- 계좌이체 / 지역화폐 / 페이먼츠 등 결제 수단별 가격 확장
-- ================================================================

-- 컬럼이 없을 때만 추가 (멱등성 보장)
ALTER TABLE gym_products
  ADD COLUMN IF NOT EXISTS payment_prices JSONB NOT NULL DEFAULT '{}';
