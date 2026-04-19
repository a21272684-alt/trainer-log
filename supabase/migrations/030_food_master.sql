-- 030_food_master.sql
-- 식품 마스터 테이블 (식약처 식품영양성분 DB 기반)
-- 영양소 값은 모두 g당(per_g) 정규화 값으로 저장

-- 한국어 유사 검색을 위한 trigram 확장
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS food_master (
  id              BIGSERIAL   PRIMARY KEY,
  food_name       TEXT        NOT NULL,
  food_category   TEXT,
  calories_per_g  DECIMAL(10,6),
  protein_per_g   DECIMAL(10,6),
  carbs_per_g     DECIMAL(10,6),
  fat_per_g       DECIMAL(10,6),
  fiber_per_g     DECIMAL(10,6),
  sodium_per_g    DECIMAL(10,6),  -- mg/g 단위
  sugar_per_g     DECIMAL(10,6),
  source          TEXT        DEFAULT '식약처',
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ILIKE 검색 인덱스
CREATE INDEX IF NOT EXISTS food_master_name_pattern_idx
  ON food_master (food_name text_pattern_ops);

-- trigram GIN 인덱스 (부분 일치·오타 허용 검색)
CREATE INDEX IF NOT EXISTS food_master_name_trgm_idx
  ON food_master USING gin (food_name gin_trgm_ops);

-- RLS: 읽기만 공개
ALTER TABLE food_master ENABLE ROW LEVEL SECURITY;
CREATE POLICY "food_master_select" ON food_master FOR SELECT USING (true);
