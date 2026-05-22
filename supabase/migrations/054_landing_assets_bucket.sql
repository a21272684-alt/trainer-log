-- 054_landing_assets_bucket.sql
-- 랜딩 후기 등 admin 이 업로드하는 이미지용 스토리지 버킷.
-- admin 포털은 Supabase OAuth 가 아닌 ID/PW(anon) 로 동작하므로,
-- 기존 trainer-photos(033) 와 동일한 public + allow_all 정책을 사용한다.
-- 안전장치로 버킷 자체에 크기(3MB)/이미지 타입 제한을 건다.

-- 1. landing-assets 버킷 생성 (public, 3MB 제한, 이미지 타입만)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'landing-assets',
  'landing-assets',
  true,
  3145728,  -- 3MB
  ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. 스토리지 정책 (trainer-photos 와 동일 패턴 — anon 포함 전체 허용)
DROP POLICY IF EXISTS "allow_all_landing_assets" ON storage.objects;
CREATE POLICY "allow_all_landing_assets" ON storage.objects
  FOR ALL
  USING (bucket_id = 'landing-assets')
  WITH CHECK (bucket_id = 'landing-assets');
