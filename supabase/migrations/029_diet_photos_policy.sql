-- 029_diet_photos_policy.sql
-- diet-photos 스토리지 버킷 업로드/삭제 정책 추가

create policy "allow_all_diet_photos" on storage.objects
  for all
  using (bucket_id = 'diet-photos')
  with check (bucket_id = 'diet-photos');
