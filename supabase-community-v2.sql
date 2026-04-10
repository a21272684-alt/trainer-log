-- =============================================
-- 커뮤니티 포털 v2 마이그레이션
-- Supabase 대시보드 > SQL Editor 에서 실행
-- =============================================

-- 1. community_users 에 컬럼 추가
ALTER TABLE community_users ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE community_users ADD COLUMN IF NOT EXISTS auth_id text UNIQUE;
ALTER TABLE community_users ADD COLUMN IF NOT EXISTS phone text;

-- 기존 phone 컬럼이 NOT NULL이었다면 해제
ALTER TABLE community_users ALTER COLUMN phone DROP NOT NULL;

-- 2. Supabase Storage 버킷 생성 (프로필 사진)
INSERT INTO storage.buckets (id, name, public)
VALUES ('community-profiles', 'community-profiles', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Storage RLS 정책
CREATE POLICY "public read community-profiles"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'community-profiles');

CREATE POLICY "public insert community-profiles"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'community-profiles');

CREATE POLICY "public update community-profiles"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'community-profiles');

-- =============================================
-- Supabase 대시보드에서 추가로 해야 할 작업:
-- Authentication > Providers > Google 활성화
--   - Client ID / Secret 입력 (Google Cloud Console)
-- Authentication > URL Configuration
--   - Redirect URL 추가: http://localhost:3000/community
--   - 배포 후: https://yourdomain.com/community
-- =============================================
