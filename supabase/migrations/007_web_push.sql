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
create policy "trainer_push_sub" on push_subscriptions
  using (trainer_id = auth.uid()) with check (trainer_id = auth.uid());

-- Web Push: 발송 예약 테이블
create table if not exists scheduled_notifications (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid references trainers(id) on delete cascade,
  block_id text not null,
  scheduled_at timestamptz not null,
  title text not null default '🏋️ TrainerLog',
  body text not null,
  sent boolean default false,
  created_at timestamptz default now(),
  unique(trainer_id, block_id)
);

alter table scheduled_notifications enable row level security;
create policy "trainer_scheduled_notif" on scheduled_notifications
  using (trainer_id = auth.uid()) with check (trainer_id = auth.uid());

-- pg_cron: 1분마다 발송 대상 체크 (Supabase Dashboard > Database > Extensions > pg_cron 활성화 필요)
-- select cron.schedule('send-push-notifications', '* * * * *',
--   $$select net.http_post(
--     url := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-push',
--     headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
--     body := '{}'::jsonb
--   )$$
-- );
