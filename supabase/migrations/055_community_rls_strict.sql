-- 055_community_rls_strict.sql
-- Phase 1 / R1 (P0) — CommunityPortal 클러스터 RLS 강화 (auth.uid() 기반)
--
-- 배경:
--   013/016/023/20260424 마이그레이션이 community_* 테이블에 모두
--   `using (true)` (allow_all) 정책을 걸어둠. anon key 만으로:
--     · community_users 의 전 회원 PII(이름/전화/카카오링크) + admin_permissions 조회
--     · 본인 행이 아니어도 admin_permissions UPDATE → 권한 상승(escalation) 가능
--     · community_contacts 의 1:1 메시지 전체 열람
--   운영 배포 즉시 PIPA 위반 + 관리자 권한 노출.
--
-- 인증 모델 (확인됨):
--   CommunityPortal 은 Supabase OAuth(Google/Kakao) 사용. community_users 에
--   auth_id 컬럼이 있고 `.eq('auth_id', auth.uid())` 로 본인 행을 찾는다.
--   → trainers/members(050/051) 와 동일하게 auth.uid() 기반 strict RLS 가능.
--
-- ⚠️ 컬럼 타입: 이 DB 의 community_users.auth_id 는 TEXT 다 (trainers/members
--   는 uuid 였으나 community_users 는 text 로 남은 드리프트). auth.uid() 는
--   uuid 를 반환하므로 모든 비교를 `auth.uid()::text = auth_id` 로 캐스팅한다
--   (컬럼이 아닌 함수 쪽을 캐스팅 → auth_id 인덱스 그대로 사용).
--
-- 범위 (이번 마이그레이션):
--   community_users / community_posts / community_contacts
--   / market_purchases / market_item_contents
--   ※ member_posts / member_reactions 는 "배포된 회원 앱(MemberPortal)" 전용이라
--     이번 범위에서 제외 (별도 마이그레이션에서 회원앱 검증 후 처리).
--   ※ post_reactions(013) 는 CommunityPortal 미사용(구 피드 잔재)이라 제외.
--
-- ⚠️ AdminPortal 영향 (의도된 임시 차단):
--   AdminPortal 은 ID/PW + anon key 로 community_* 를 직접 read/write 한다
--   (admin_permissions 편집 포함). 본 마이그레이션 적용 후 AdminPortal 의
--   커뮤니티 관리 탭은 RLS 로 차단된다. 050 이 trainers/members 에 한 것과
--   동일한 선례 — 당분간 SQL Editor 로 관리하고, 후속 056 에서 admin
--   SECURITY DEFINER RPC(052 패턴)로 복구 예정.
--
-- 멱등성: 모든 정책은 DROP POLICY IF EXISTS 후 재생성.

-- self lookup 헬퍼: 현재 auth.uid() 에 매핑된 community_users.id 집합
--   (인라인 서브쿼리로 사용. 별도 함수 미도입 — 유지보수 단순화)

-- ============================================================
-- 0. 기존 정책 전부 제거 (이름 무관) — 추적 안 된 {public} 정책들
--    (public read/insert/update, cu_select_public, cu_*_self, mp_*, mic_* 등)
--    이 남아 strict 정책과 OR 로 합쳐지면 anon 누출이 계속되므로,
--    5개 테이블의 모든 기존 정책을 동적으로 DROP 후 아래에서 재생성한다.
-- ============================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'community_users', 'community_posts', 'community_contacts',
        'market_purchases', 'market_item_contents'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
                   r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- ============================================================
-- 1. community_users — 본인 행만 INSERT/UPDATE. SELECT 는 로그인 사용자 전체.
-- ============================================================
ALTER TABLE community_users ENABLE ROW LEVEL SECURITY;

-- SELECT: 로그인한 커뮤니티 사용자끼리는 서로 조회 가능
--   (피드의 author 표시, 컨택 requester 표시에 필요). anon 은 전면 차단.
CREATE POLICY "community_users_select" ON community_users
  FOR SELECT TO authenticated
  USING (true);

-- INSERT: 본인 auth_id 로만 가입 가능
CREATE POLICY "community_users_insert" ON community_users
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid()::text = auth_id);

-- UPDATE: 본인 행만 (프로필 수정)
CREATE POLICY "community_users_update" ON community_users
  FOR UPDATE TO authenticated
  USING      (auth.uid()::text = auth_id)
  WITH CHECK (auth.uid()::text = auth_id);

-- DELETE 정책 부여 안 함 → 사용자 삭제는 admin(향후 RPC) 전담.

-- self-escalation 방지: 본인 행이라도 admin_permissions / role 은 변경 불가.
--   (가입 시 INSERT 로는 role 지정 가능 — INSERT 는 컬럼 REVOKE 영향 없음.
--    admin_permissions 는 DEFAULT '{}' 라 INSERT 시 생략됨.)
--   admin 영역의 SECURITY DEFINER RPC(향후 056)는 테이블 GRANT 영향 안 받음.
REVOKE UPDATE (admin_permissions, role) ON community_users FROM authenticated, anon;

-- ============================================================
-- 2. community_posts — 작성자(user_id)만 쓰기. SELECT 는 로그인 사용자 전체.
-- ============================================================
DROP POLICY IF EXISTS "allow_all_community_posts" ON community_posts;
DROP POLICY IF EXISTS "community_posts_select" ON community_posts;
DROP POLICY IF EXISTS "community_posts_insert" ON community_posts;
DROP POLICY IF EXISTS "community_posts_update" ON community_posts;
DROP POLICY IF EXISTS "community_posts_delete" ON community_posts;

ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "community_posts_select" ON community_posts
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "community_posts_insert" ON community_posts
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id IN (SELECT id FROM community_users WHERE auth_id = auth.uid()::text)
  );

CREATE POLICY "community_posts_update" ON community_posts
  FOR UPDATE TO authenticated
  USING (
    user_id IN (SELECT id FROM community_users WHERE auth_id = auth.uid()::text)
  )
  WITH CHECK (
    user_id IN (SELECT id FROM community_users WHERE auth_id = auth.uid()::text)
  );

CREATE POLICY "community_posts_delete" ON community_posts
  FOR DELETE TO authenticated
  USING (
    user_id IN (SELECT id FROM community_users WHERE auth_id = auth.uid()::text)
  );

-- ============================================================
-- 3. contact_count 트리거 — 비작성자가 작성자 게시글의 카운터를 올려야 하므로
--    클라이언트 직접 UPDATE(작성자-only RLS 위반) 대신 트리거로 처리.
--    SECURITY DEFINER 라 RLS 우회. (CommunityPortal 의 클라이언트측
--    contact_count 증가 코드는 제거 — 중복 카운트 방지.)
-- ============================================================
CREATE OR REPLACE FUNCTION bump_community_contact_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE community_posts
     SET contact_count = COALESCE(contact_count, 0) + 1
   WHERE id = NEW.post_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_contact_count ON community_contacts;
CREATE TRIGGER trg_community_contact_count
  AFTER INSERT ON community_contacts
  FOR EACH ROW
  EXECUTE FUNCTION bump_community_contact_count();

-- ============================================================
-- 4. community_contacts — 요청자 본인 또는 게시글 작성자만 access.
-- ============================================================
DROP POLICY IF EXISTS "allow_all_community_contacts" ON community_contacts;
DROP POLICY IF EXISTS "community_contacts_select" ON community_contacts;
DROP POLICY IF EXISTS "community_contacts_insert" ON community_contacts;
DROP POLICY IF EXISTS "community_contacts_update" ON community_contacts;

ALTER TABLE community_contacts ENABLE ROW LEVEL SECURITY;

-- SELECT: 본인이 보낸 컨택 OR 본인 게시글에 들어온 컨택
CREATE POLICY "community_contacts_select" ON community_contacts
  FOR SELECT TO authenticated
  USING (
    requester_id IN (SELECT id FROM community_users WHERE auth_id = auth.uid()::text)
    OR post_id IN (
      SELECT p.id FROM community_posts p
      WHERE p.user_id IN (SELECT id FROM community_users WHERE auth_id = auth.uid()::text)
    )
  );

-- INSERT: 본인(requester_id) 으로만 컨택 전송
CREATE POLICY "community_contacts_insert" ON community_contacts
  FOR INSERT TO authenticated
  WITH CHECK (
    requester_id IN (SELECT id FROM community_users WHERE auth_id = auth.uid()::text)
  );

-- UPDATE(status 수락/거절): 게시글 작성자만
CREATE POLICY "community_contacts_update" ON community_contacts
  FOR UPDATE TO authenticated
  USING (
    post_id IN (
      SELECT p.id FROM community_posts p
      WHERE p.user_id IN (SELECT id FROM community_users WHERE auth_id = auth.uid()::text)
    )
  )
  WITH CHECK (
    post_id IN (
      SELECT p.id FROM community_posts p
      WHERE p.user_id IN (SELECT id FROM community_users WHERE auth_id = auth.uid()::text)
    )
  );

-- ============================================================
-- 5. market_purchases — 구매자/판매자 본인만 조회. INSERT 는 본인(buyer) 확인.
--    (실제 구매는 SECURITY DEFINER RPC purchase_market_item 경유도 가능)
-- ============================================================
DROP POLICY IF EXISTS "mp_read"   ON market_purchases;
DROP POLICY IF EXISTS "mp_insert" ON market_purchases;
DROP POLICY IF EXISTS "market_purchases_select" ON market_purchases;
DROP POLICY IF EXISTS "market_purchases_insert" ON market_purchases;

ALTER TABLE market_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "market_purchases_select" ON market_purchases
  FOR SELECT TO authenticated
  USING (
    buyer_id  IN (SELECT id FROM community_users WHERE auth_id = auth.uid()::text)
    OR seller_id IN (SELECT id FROM community_users WHERE auth_id = auth.uid()::text)
  );

CREATE POLICY "market_purchases_insert" ON market_purchases
  FOR INSERT TO authenticated
  WITH CHECK (
    buyer_id IN (SELECT id FROM community_users WHERE auth_id = auth.uid()::text)
  );

-- ============================================================
-- 6. market_item_contents — 구매자 또는 판매자만 전문 콘텐츠 열람.
-- ============================================================
DROP POLICY IF EXISTS "mic_read"   ON market_item_contents;
DROP POLICY IF EXISTS "mic_insert" ON market_item_contents;
DROP POLICY IF EXISTS "mic_update" ON market_item_contents;
DROP POLICY IF EXISTS "market_item_contents_select" ON market_item_contents;
DROP POLICY IF EXISTS "market_item_contents_insert" ON market_item_contents;
DROP POLICY IF EXISTS "market_item_contents_update" ON market_item_contents;

ALTER TABLE market_item_contents ENABLE ROW LEVEL SECURITY;

-- SELECT: 판매자(게시글 작성자) 또는 구매 완료자
CREATE POLICY "market_item_contents_select" ON market_item_contents
  FOR SELECT TO authenticated
  USING (
    post_id IN (
      SELECT p.id FROM community_posts p
      WHERE p.user_id IN (SELECT id FROM community_users WHERE auth_id = auth.uid()::text)
    )
    OR post_id IN (
      SELECT mp.post_id FROM market_purchases mp
      WHERE mp.buyer_id IN (SELECT id FROM community_users WHERE auth_id = auth.uid()::text)
    )
  );

-- INSERT/UPDATE: 판매자(게시글 작성자)만
CREATE POLICY "market_item_contents_insert" ON market_item_contents
  FOR INSERT TO authenticated
  WITH CHECK (
    post_id IN (
      SELECT p.id FROM community_posts p
      WHERE p.user_id IN (SELECT id FROM community_users WHERE auth_id = auth.uid()::text)
    )
  );

CREATE POLICY "market_item_contents_update" ON market_item_contents
  FOR UPDATE TO authenticated
  USING (
    post_id IN (
      SELECT p.id FROM community_posts p
      WHERE p.user_id IN (SELECT id FROM community_users WHERE auth_id = auth.uid()::text)
    )
  )
  WITH CHECK (
    post_id IN (
      SELECT p.id FROM community_posts p
      WHERE p.user_id IN (SELECT id FROM community_users WHERE auth_id = auth.uid()::text)
    )
  );

-- ============================================================
-- 7. 성능 인덱스
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_community_users_auth_id ON community_users (auth_id);
CREATE INDEX IF NOT EXISTS idx_community_posts_user_id  ON community_posts  (user_id);
CREATE INDEX IF NOT EXISTS idx_community_contacts_post  ON community_contacts (post_id);
CREATE INDEX IF NOT EXISTS idx_community_contacts_req   ON community_contacts (requester_id);

-- ============================================================
-- 검증 쿼리 (적용 후 SQL Editor 에서 anon 으로 확인)
-- ----------------------------------------------------------------
--   SET ROLE anon;
--   SELECT * FROM community_users LIMIT 1;   -- 0행 (차단) 기대
--   SELECT * FROM community_contacts LIMIT 1;-- 0행 (차단) 기대
--   RESET ROLE;
-- ============================================================
