-- 034_payment_method.sql
-- payments 테이블에 결제 수단 컬럼 추가

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'card',
  ADD COLUMN IF NOT EXISTS payment_method_memo TEXT;
