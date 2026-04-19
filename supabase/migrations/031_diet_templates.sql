-- 031_diet_templates.sql
-- 자주쓰는 식단 템플릿 (회원별 저장 매크로)

CREATE TABLE IF NOT EXISTS diet_templates (
  id          BIGSERIAL   PRIMARY KEY,
  member_id   TEXT        NOT NULL,
  name        TEXT        NOT NULL,
  meal_type   TEXT,       -- 'breakfast' | 'lunch' | 'dinner' | 'snack' | null(범용)
  items       JSONB       NOT NULL DEFAULT '[]',
  used_count  INT         NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS diet_templates_member_idx ON diet_templates (member_id);

ALTER TABLE diet_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "diet_templates_all" ON diet_templates FOR ALL USING (true) WITH CHECK (true);
