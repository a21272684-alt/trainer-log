-- community_posts 에 이미지 URL 배열 컬럼 추가
ALTER TABLE community_posts
  ADD COLUMN IF NOT EXISTS image_urls TEXT[];
