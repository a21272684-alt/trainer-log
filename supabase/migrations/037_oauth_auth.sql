-- 037_oauth_auth.sql
-- OAuth 로그인 전환: trainers / members 테이블에 auth_id · email 컬럼 추가

-- 트레이너: Supabase Auth ID + 이메일
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS auth_id TEXT UNIQUE;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS email   TEXT;

-- 회원: Supabase Auth ID (이메일은 기존 컬럼 재사용)
ALTER TABLE members ADD COLUMN IF NOT EXISTS auth_id TEXT UNIQUE;
