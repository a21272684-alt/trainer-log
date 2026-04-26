-- community_users 에 관리자 권한 컬럼 추가
ALTER TABLE community_users
  ADD COLUMN IF NOT EXISTS admin_permissions JSONB DEFAULT '{}'::jsonb;

-- RLS: anon key 로 읽기/쓰기 허용 (기존 정책이 없으면 생성)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'community_users'
    AND policyname = 'allow_all_community_users'
  ) THEN
    ALTER TABLE community_users ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "allow_all_community_users" ON community_users
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END
$$;
