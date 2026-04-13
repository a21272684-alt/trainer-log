-- 커뮤니티 게시물 (같은 트레이너 소속 회원끼리 공유)
create table if not exists community_posts (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references members(id) on delete cascade,
  member_name text,
  trainer_id uuid not null,
  content text,
  photo_url text,
  created_at timestamptz default now()
);
alter table community_posts enable row level security;
create policy "allow_all_community_posts" on community_posts for all using (true) with check (true);

-- 게시물 반응 (좋아요 + 이모지)
create table if not exists post_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references community_posts(id) on delete cascade,
  member_id uuid references members(id) on delete cascade,
  reaction text not null,
  created_at timestamptz default now(),
  unique(post_id, member_id, reaction)
);
alter table post_reactions enable row level security;
create policy "allow_all_post_reactions" on post_reactions for all using (true) with check (true);

-- community-photos 스토리지 버킷
insert into storage.buckets (id, name, public)
values ('community-photos', 'community-photos', true)
on conflict do nothing;

create policy "allow_all_community_photos" on storage.objects
  for all using (bucket_id = 'community-photos') with check (bucket_id = 'community-photos');
