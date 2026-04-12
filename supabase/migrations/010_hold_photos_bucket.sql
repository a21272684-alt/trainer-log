-- hold-photos Storage 버킷 생성
insert into storage.buckets (id, name, public)
values ('hold-photos', 'hold-photos', true)
on conflict (id) do nothing;

-- 트레이너 본인만 업로드/삭제 가능
create policy "trainer_upload_hold_photos" on storage.objects
  for insert with check (
    bucket_id = 'hold-photos' and auth.role() = 'authenticated'
  );

create policy "trainer_delete_hold_photos" on storage.objects
  for delete using (
    bucket_id = 'hold-photos' and auth.uid()::text = (storage.foldername(name))[2]
  );

-- 공개 읽기 허용 (이미지 URL 직접 접근)
create policy "public_read_hold_photos" on storage.objects
  for select using (bucket_id = 'hold-photos');
