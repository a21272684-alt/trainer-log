-- 033_trainer_profile.sql
-- 트레이너 프로필 사진 URL 컬럼 + 스토리지 버킷/정책 추가

-- 1. 컬럼 추가
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;

-- 2. trainer-photos 스토리지 버킷 생성 (public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('trainer-photos', 'trainer-photos', true)
ON CONFLICT (id) DO NOTHING;

-- 3. 스토리지 정책 추가 (diet-photos와 동일한 패턴)
CREATE POLICY "allow_all_trainer_photos" ON storage.objects
  FOR ALL
  USING (bucket_id = 'trainer-photos')
  WITH CHECK (bucket_id = 'trainer-photos');
