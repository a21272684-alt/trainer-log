-- Web Push: 구독 정보 저장
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid references trainers(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now(),
  unique(trainer_id)
);

alter table push_subscriptions enable row level security;
-- 2026-10-10 수정: trainers.id ≠ auth.uid() (auth_id 가 auth.uid()). 050/051 패턴과 일치시킴.
create policy "trainer_push_sub" on push_subscriptions
  using (trainer_id in (select id from trainers where auth_id = auth.uid()))
  with check (trainer_id in (select id from trainers where auth_id = auth.uid()));

-- Web Push: 발송 예약 테이블
create table if not exists scheduled_notifications (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid references trainers(id) on delete cascade,
  block_id text not null,
  scheduled_at timestamptz not null,
  title text not null default '🏋️ 오운',
  body text not null,
  sent boolean default false,
  created_at timestamptz default now(),
  unique(trainer_id, block_id)
);

alter table scheduled_notifications enable row level security;
-- 2026-10-10 수정: trainers.id ≠ auth.uid() (auth_id 가 auth.uid()). 050/051 패턴과 일치시킴.
create policy "trainer_scheduled_notif" on scheduled_notifications
  using (trainer_id in (select id from trainers where auth_id = auth.uid()))
  with check (trainer_id in (select id from trainers where auth_id = auth.uid()));

-- 발송 완료 7일 경과 알림 자동 삭제 (cron: oun_cleanup_scheduled_no... 이 호출)
create or replace function cleanup_scheduled_notifications_sent_older_than_7d()
returns void
language sql
security definer
set search_path = public
as $$
  delete from scheduled_notifications
  where sent = true
    and scheduled_at < now() - interval '7 days';
$$;

-- pg_cron: 1분마다 발송 대상 체크 (Supabase Dashboard > Database > Extensions > pg_cron 활성화 필요)
-- select cron.schedule('send-push-notifications', '* * * * *',
--   $$select net.http_post(
--     url := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-push',
--     headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
--     body := '{}'::jsonb
--   )$$
-- );
