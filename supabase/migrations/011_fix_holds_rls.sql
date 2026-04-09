-- member_holds RLS 수정: 앱 자체 인증 방식 (Supabase Auth 미사용)에 맞게 완전 허용
-- (trainer_id 컬럼으로 앱 레벨에서 필터링)
drop policy if exists "trainer_holds" on member_holds;
create policy "allow_all_member_holds" on member_holds for all using (true) with check (true);

-- hold-photos Storage 정책도 동일하게 수정
drop policy if exists "trainer_upload_hold_photos" on storage.objects;
drop policy if exists "trainer_delete_hold_photos" on storage.objects;
create policy "allow_upload_hold_photos" on storage.objects
  for insert with check (bucket_id = 'hold-photos');
create policy "allow_delete_hold_photos" on storage.objects
  for delete using (bucket_id = 'hold-photos');
