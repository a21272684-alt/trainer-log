-- ============================================================
-- 023_educator_market.sql
-- 교육자 전용 마켓 기능
--
-- 설계:
--   community_posts 를 기반으로 educator_market 카테고리 추가.
--   가격·타입·구매수 컬럼 추가 + 구매 이력·콘텐츠 잠금 테이블 신설.
--
-- 구조:
--   community_posts  (기존)
--     + price          integer        — 0 = 무료
--     + market_type    text           — routine | program | nutrition | content
--     + purchase_count integer        — 자동 갱신 (트리거)
--
--   market_purchases  (신규) — 구매 이력
--   market_item_contents (신규) — 구매 후 공개 전문 콘텐츠
--
-- 권한:
--   educator, instructor → 등록 가능
--   전 역할(trainer, member, gym_owner, educator, instructor) → 조회·구매 가능
--
-- 결제:
--   현재는 DB 기록 기반 트러스트 방식 (명예 과금).
--   추후 Toss Payments / 카카오페이 연동 시 payment_id 컬럼 추가 예정.
-- ============================================================

-- ── 1. community_posts 마켓 컬럼 추가 ───────────────────────

alter table community_posts
  add column if not exists price          integer default 0 check (price >= 0),
  add column if not exists market_type    text
    check (market_type in ('routine','program','nutrition','content')),
  add column if not exists purchase_count integer default 0;

comment on column community_posts.price         is '상품 가격 (원). 0=무료.';
comment on column community_posts.market_type   is 'routine|program|nutrition|content';
comment on column community_posts.purchase_count is '누적 구매 수 (트리거 자동 갱신)';

create index if not exists idx_posts_market
  on community_posts (category, price, created_at desc)
  where category = 'educator_market';

-- ── 2. market_purchases 테이블 ──────────────────────────────

create table if not exists market_purchases (
  id           uuid        primary key default gen_random_uuid(),
  post_id      uuid        not null references community_posts(id) on delete cascade,
  buyer_id     uuid        not null references community_users(id) on delete cascade,
  seller_id    uuid        not null references community_users(id),
  amount_paid  integer     not null default 0,  -- 구매 당시 가격 박제
  purchased_at timestamptz default now(),
  unique (post_id, buyer_id)                    -- 중복 구매 방지
);

alter table market_purchases enable row level security;
create policy "mp_read"   on market_purchases for select using (true);
create policy "mp_insert" on market_purchases for insert with check (true);

create index if not exists idx_mp_buyer  on market_purchases (buyer_id, purchased_at desc);
create index if not exists idx_mp_seller on market_purchases (seller_id, purchased_at desc);
create index if not exists idx_mp_post   on market_purchases (post_id);

comment on table market_purchases is '마켓 상품 구매 이력. amount_paid는 구매 시점 가격 박제.';

-- ── 3. market_item_contents 테이블 ──────────────────────────
-- community_posts.content = 미리보기 (공개)
-- full_content            = 구매 후 열람 가능한 전문

create table if not exists market_item_contents (
  post_id       uuid    primary key references community_posts(id) on delete cascade,
  full_content  text,                -- 전문 텍스트 (구매자·판매자만 열람)
  routine_data  jsonb,               -- 운동 루틴 JSON (routine 타입용)
  file_url      text,                -- PDF·영상 URL
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

alter table market_item_contents enable row level security;
create policy "mic_read"   on market_item_contents for select using (true);
create policy "mic_insert" on market_item_contents for insert with check (true);
create policy "mic_update" on market_item_contents for update using (true);

comment on table market_item_contents is '구매 후 공개되는 전문 콘텐츠. post_id 1:1 관계.';

-- ── 4. 구매 시 purchase_count 자동 갱신 트리거 ──────────────

create or replace function increment_purchase_count()
returns trigger language plpgsql as $$
begin
  update community_posts
  set purchase_count = purchase_count + 1
  where id = new.post_id;
  return new;
end;
$$;

drop trigger if exists trg_purchase_count on market_purchases;
create trigger trg_purchase_count
  after insert on market_purchases
  for each row
  execute function increment_purchase_count();

-- ── 5. RPC — 구매 처리 ──────────────────────────────────────

create or replace function purchase_market_item(
  p_post_id   uuid,
  p_buyer_id  uuid
)
returns jsonb
language plpgsql security definer as $$
declare
  v_post      record;
  v_seller_id uuid;
  v_purchase  uuid;
begin
  -- 상품 존재 확인
  select id, user_id, price into v_post
  from community_posts
  where id = p_post_id and category = 'educator_market' and status = 'active';

  if not found then
    return jsonb_build_object('ok', false, 'error', '상품을 찾을 수 없습니다');
  end if;

  -- 자기 상품 구매 방지
  if v_post.user_id = p_buyer_id then
    return jsonb_build_object('ok', false, 'error', '본인 상품은 구매할 수 없습니다');
  end if;

  -- 중복 구매 확인
  if exists (select 1 from market_purchases where post_id = p_post_id and buyer_id = p_buyer_id) then
    return jsonb_build_object('ok', false, 'error', '이미 구매한 상품입니다');
  end if;

  -- 구매 처리
  insert into market_purchases (post_id, buyer_id, seller_id, amount_paid)
  values (p_post_id, p_buyer_id, v_post.user_id, v_post.price)
  returning id into v_purchase;

  return jsonb_build_object('ok', true, 'purchase_id', v_purchase);
end;
$$;

-- ── 6. RPC — 구매 여부 확인 ─────────────────────────────────

create or replace function check_market_purchase(p_post_id uuid, p_buyer_id uuid)
returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from market_purchases
    where post_id = p_post_id and buyer_id = p_buyer_id
  );
$$;

-- ── 7. RPC — 판매자 대시보드 통계 ───────────────────────────

create or replace function get_seller_stats(p_seller_id uuid)
returns jsonb
language sql stable security definer as $$
  select jsonb_build_object(
    'total_items',   (select count(*) from community_posts
                       where user_id = p_seller_id and category = 'educator_market'),
    'total_sales',   (select count(*) from market_purchases where seller_id = p_seller_id),
    'total_revenue', (select coalesce(sum(amount_paid), 0) from market_purchases where seller_id = p_seller_id),
    'free_items',    (select count(*) from community_posts
                       where user_id = p_seller_id and category = 'educator_market' and price = 0),
    'paid_items',    (select count(*) from community_posts
                       where user_id = p_seller_id and category = 'educator_market' and price > 0),
    'recent_purchases', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'buyer_name',   cu.name,
          'post_title',   cp.title,
          'amount',       mp.amount_paid,
          'purchased_at', mp.purchased_at
        ) order by mp.purchased_at desc
      ), '[]')
      from market_purchases mp
      join community_users cu on cu.id = mp.buyer_id
      join community_posts cp on cp.id = mp.post_id
      where mp.seller_id = p_seller_id
      limit 10
    )
  );
$$;

-- ── 8. 편의 뷰 — 마켓 전체 목록 ────────────────────────────

create or replace view v_market_items as
  select
    cp.id,
    cp.user_id   as seller_id,
    cu.name      as seller_name,
    cu.role      as seller_role,
    cu.avatar_url,
    cu.location  as seller_location,
    cp.title,
    cp.content   as preview,
    cp.price,
    cp.market_type,
    cp.purchase_count,
    cp.tags,
    cp.status,
    cp.created_at,
    mic.full_content is not null as has_full_content
  from community_posts cp
  join community_users cu on cu.id = cp.user_id
  left join market_item_contents mic on mic.post_id = cp.id
  where cp.category = 'educator_market'
  order by cp.created_at desc;

-- ── 9. 검증 쿼리 (참고용) ───────────────────────────────────
-- select purchase_market_item('<post-uuid>', '<buyer-uuid>');
-- select get_seller_stats('<seller-uuid>');
-- select * from v_market_items where status = 'active';
