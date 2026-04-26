-- 1:1 문의 테이블
CREATE TABLE IF NOT EXISTS inquiries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id  UUID REFERENCES trainers(id) ON DELETE CASCADE,
  category    TEXT NOT NULL DEFAULT 'general',
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',  -- pending | answered
  answer      TEXT,
  answered_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS inquiries_trainer_id_idx ON inquiries(trainer_id);
CREATE INDEX IF NOT EXISTS inquiries_status_idx     ON inquiries(status);
CREATE INDEX IF NOT EXISTS inquiries_created_at_idx ON inquiries(created_at DESC);

-- RLS
ALTER TABLE inquiries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_inquiries" ON inquiries;
CREATE POLICY "allow_all_inquiries" ON inquiries
  FOR ALL USING (true) WITH CHECK (true);
