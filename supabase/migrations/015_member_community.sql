-- 회원포털 전용 커뮤니티 테이블 (CommunityPortal의 community_posts와 별개)
create table if not exists member_posts (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references members(id) on delete cascade,
  member_name text,
  trainer_id uuid not null,
  content text,
  photo_url text,
  created_at timestamptz default now()
);
alter table member_posts enable row level security;
create policy "allow_all_member_posts" on member_posts for all using (true) with check (true);

-- 게시물 반응 (이모지)
create table if not exists member_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references member_posts(id) on delete cascade,
  member_id uuid references members(id) on delete cascade,
  reaction text not null,
  created_at timestamptz default now(),
  unique(post_id, member_id, reaction)
);
alter table member_reactions enable row level security;
create policy "allow_all_member_reactions" on member_reactions for all using (true) with check (true);

-- community-photos 스토리지 버킷 (없을 경우에만)
insert into storage.buckets (id, name, public)
values ('community-photos', 'community-photos', true)
on conflict do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'objects'
      and policyname = 'allow_all_community_photos'
  ) then
    execute $policy$
      create policy "allow_all_community_photos" on storage.objects
        for all using (bucket_id = 'community-photos') with check (bucket_id = 'community-photos')
    $policy$;
  end if;
end $$;
