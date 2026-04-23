-- ================================================================
-- 024_gym_products.sql
-- 센터(gym) 전용 상품 테이블
-- ================================================================

CREATE TABLE IF NOT EXISTS gym_products (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id               UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,

  -- 기본 정보
  name                 TEXT        NOT NULL,
  category             TEXT        NOT NULL DEFAULT '회원권',
    -- 허용값: 회원권 | 레슨 | 대여권 | 구독권 | 패키지 | 일반

  -- 가격 (원, VAT 미포함 기준)
  price_cash           INTEGER     NOT NULL DEFAULT 0,   -- 현금가
  price_card           INTEGER     NOT NULL DEFAULT 0,   -- 카드가

  -- 결제 수단별 확장 가격 (JSONB)
  -- { transfer: number|null, local_currency: [{label, price}], payments: [{label, price}] }
  payment_prices       JSONB       NOT NULL DEFAULT '{}',

  -- 이용 조건
  duration_days        INTEGER     DEFAULT NULL,         -- 이용기간(일). NULL = 무제한
  session_limit        INTEGER     DEFAULT NULL,         -- 입장횟수. NULL = 무제한

  -- 부가 옵션
  is_income_deductible BOOLEAN     NOT NULL DEFAULT false, -- 소득공제 여부
  is_active            BOOLEAN     NOT NULL DEFAULT true,  -- 판매 중 여부
  description          TEXT        DEFAULT NULL,           -- 상품 설명/메모

  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 업데이트 시 updated_at 자동 갱신
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS gym_products_updated_at ON gym_products;
CREATE TRIGGER gym_products_updated_at
  BEFORE UPDATE ON gym_products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 카테고리 제약
ALTER TABLE gym_products
  DROP CONSTRAINT IF EXISTS gym_products_category_check;
ALTER TABLE gym_products
  ADD CONSTRAINT gym_products_category_check
  CHECK (category IN ('회원권','레슨','대여권','구독권','패키지','일반'));

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_gym_products_gym_id   ON gym_products(gym_id);
CREATE INDEX IF NOT EXISTS idx_gym_products_category ON gym_products(gym_id, category);

-- RLS
ALTER TABLE gym_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gym_products_select" ON gym_products;
CREATE POLICY "gym_products_select" ON gym_products
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "gym_products_insert" ON gym_products;
CREATE POLICY "gym_products_insert" ON gym_products
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "gym_products_update" ON gym_products;
CREATE POLICY "gym_products_update" ON gym_products
  FOR UPDATE USING (true);

DROP POLICY IF EXISTS "gym_products_delete" ON gym_products;
CREATE POLICY "gym_products_delete" ON gym_products
  FOR DELETE USING (true);
