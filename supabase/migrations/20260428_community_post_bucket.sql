-- community_posts 이미지 업로드용 스토리지 버킷
INSERT INTO storage.buckets (id, name, public)
VALUES ('community-posts', 'community-posts', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects'
      AND policyname = 'allow_all_community_post_images'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "allow_all_community_post_images" ON storage.objects
        FOR ALL USING (bucket_id = 'community-posts')
        WITH CHECK (bucket_id = 'community-posts')
    $policy$;
  END IF;
END $$;

-- community_posts.status 기본값 보장
ALTER TABLE community_posts
  ALTER COLUMN status SET DEFAULT 'active';
