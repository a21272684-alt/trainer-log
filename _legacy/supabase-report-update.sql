-- logs 테이블에 공개 리포트용 고유 ID 추가
alter table logs add column if not exists report_id text;
alter table logs add column if not exists exercises_data jsonb;

-- 리포트 공개 조회 정책 (이미 있을 수 있으므로 오류 무시)
create policy "logs_public_read" on logs for select using (true);
