-- 028_diet_logs.sql
-- 식단기록 구조화: 음식별 영양소를 g당 정규화 값으로 저장

CREATE TABLE IF NOT EXISTS diet_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id       UUID        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  record_date     DATE        NOT NULL,
  meal_type       TEXT        NOT NULL CHECK (meal_type IN ('breakfast','lunch','dinner','snack')),
  food_name       TEXT        NOT NULL,
  amount_g        DECIMAL(10,2) NOT NULL DEFAULT 100,

  -- 영양소: g당 정규화 값 (어떤 단위로 AI가 제공하든 g당으로 환산 후 저장)
  calories_per_g  DECIMAL(10,6),
  protein_per_g   DECIMAL(10,6),
  carbs_per_g     DECIMAL(10,6),
  fat_per_g       DECIMAL(10,6),
  fiber_per_g     DECIMAL(10,6),
  sodium_per_g    DECIMAL(10,6),
  sugar_per_g     DECIMAL(10,6),

  photo_url       TEXT,
  ai_recognized   BOOLEAN     NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS diet_logs_member_date_idx
  ON diet_logs (member_id, record_date DESC);

-- RLS: 공개 정책 (다른 테이블과 동일)
ALTER TABLE diet_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "diet_logs_all" ON diet_logs FOR ALL USING (true) WITH CHECK (true);

-- 식단 사진 스토리지 버킷 (SQL로 직접 생성 불가 — Supabase 대시보드 또는 아래 storage API로 생성 필요)
-- Bucket name: diet-photos (public)
