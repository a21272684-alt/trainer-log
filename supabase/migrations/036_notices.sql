-- 036_notices.sql
-- 공지사항 테이블 생성 (관리자가 회원에게 공지)

CREATE TABLE IF NOT EXISTS notices (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  content     text NOT NULL,
  is_pinned   boolean DEFAULT false,
  author_name text DEFAULT '관리자',
  trainer_id  uuid REFERENCES trainers(id) ON DELETE SET NULL,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- RLS 활성화
ALTER TABLE notices ENABLE ROW LEVEL SECURITY;

-- 기존 정책 제거 후 재생성
DROP POLICY IF EXISTS "allow_all_notices" ON notices;

CREATE POLICY "allow_all_notices" ON notices
  FOR ALL USING (true) WITH CHECK (true);

-- anon / authenticated 역할에 명시적 권한 부여
GRANT ALL ON notices TO anon, authenticated;

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_notices_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notices_updated_at ON notices;
CREATE TRIGGER trg_notices_updated_at
  BEFORE UPDATE ON notices
  FOR EACH ROW
  EXECUTE FUNCTION update_notices_updated_at();
