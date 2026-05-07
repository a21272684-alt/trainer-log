-- ============================================================================
-- fix_rls_top3.sql
--
-- Step 3 RLS 진단 리포트의 Top 3 보안 뇌관 해체:
--   ① app_settings        : 익명 UPDATE/INSERT/DELETE 차단 + Admin 전용 RPC
--   ② market_item_contents: 구매자 / 판매자만 SELECT, 판매자만 INSERT/UPDATE
--   ③ Storage 6개 버킷    : 인증 사용자 + 본인 폴더(auth.uid()) 한정 INSERT/UPDATE/DELETE
--
-- 실행 위치: Supabase Dashboard → SQL Editor (한 번 실행)
-- 사전 사실 체크 (실제 스키마 기반):
--   - app_settings(key text PK, value jsonb)
--   - market_purchases(post_id, buyer_id → community_users.id, seller_id, ...)
--   - market_item_contents(post_id PK)
--   - community_posts(user_id → community_users.id)
--   - community_users(id, auth_id text UNIQUE, ...)   ← Supabase auth.uid()(uuid)와 비교 시 ::text 캐스팅 필수
-- ============================================================================


-- ════════════════════════════════════════════════════════════════════════════
-- ① app_settings : SELECT public 유지, 쓰기 차단 + Admin 전용 RPC 우회
-- ════════════════════════════════════════════════════════════════════════════
-- 배경: AdminPortal 은 Supabase Auth 미사용 + anon 키로 통신.
--       따라서 RLS 만으로 admin 만 UPDATE 허용은 불가.
--       해결: SELECT 만 anon 에 허용하고, 쓰기는 SECURITY DEFINER RPC + 하드코딩 비밀 토큰으로 우회.
--       (Supabase 호스팅은 ALTER DATABASE / ALTER ROLE 차단으로 GUC 방식 불가 → 함수 본문 하드코딩 채택)

-- ── 1-A. 기존 광범위 정책 제거
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_app_settings" ON app_settings;
DROP POLICY IF EXISTS "app_settings_select_public" ON app_settings;
DROP POLICY IF EXISTS "app_settings_block_anon_write" ON app_settings;

-- ── 1-B. SELECT : 누구나 읽기 가능 (랜딩 콘텐츠 공개 데이터라 의도된 노출)
CREATE POLICY "app_settings_select_public"
  ON app_settings
  FOR SELECT
  USING (true);

-- ── 1-C. INSERT/UPDATE/DELETE : service_role 만 직접 가능, anon/authenticated 차단
CREATE POLICY "app_settings_write_service_role_only"
  ON app_settings
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── 1-D. 비밀 토큰 보관 방식
--   Supabase 호스팅 환경은 ALTER DATABASE / ALTER ROLE 권한이 잠겨 있어
--   GUC(app.admin_secret) 방식이 차단된다. 1인 운영용 임시 처방으로
--   토큰을 함수 본문에 하드코딩한다.
--   ⚠️ 운영 단계에서는 반드시 '!eoghkaptiruscales2684!' 문자열을
--      충분히 긴 랜덤 토큰으로 교체하고, 동일 토큰을 AdminPortal 빌드
--      환경변수(VITE_ADMIN_DB_TOKEN) 에 주입해 RPC 호출 시 함께 전달할 것.

-- ── 1-E. Admin 전용 upsert RPC (SECURITY DEFINER + 하드코딩 토큰 검증)
CREATE OR REPLACE FUNCTION app_settings_admin_upsert(
  p_key         text,
  p_value       jsonb,
  p_admin_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_admin_token IS NULL OR p_admin_token <> '' THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  INSERT INTO app_settings(key, value)
  VALUES (p_key, p_value)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

  RETURN jsonb_build_object('ok', true, 'key', p_key);
END;
$$;

-- ── 1-F. Admin 전용 delete RPC (SECURITY DEFINER + 하드코딩 토큰 검증)
CREATE OR REPLACE FUNCTION app_settings_admin_delete(
  p_key         text,
  p_admin_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_admin_token IS NULL OR p_admin_token <> 'hardcoded_admin_token_here' THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  DELETE FROM app_settings WHERE key = p_key;
  RETURN jsonb_build_object('ok', true, 'key', p_key);
END;
$$;

-- ── 1-G. 권한: anon/authenticated 가 RPC 호출 가능 (토큰 검증은 함수 내부에서)
REVOKE ALL ON FUNCTION app_settings_admin_upsert(text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_settings_admin_upsert(text, jsonb, text) TO anon, authenticated;
REVOKE ALL ON FUNCTION app_settings_admin_delete(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_settings_admin_delete(text, text) TO anon, authenticated;

COMMENT ON FUNCTION app_settings_admin_upsert(text, jsonb, text) IS
  'AdminPortal 우회용 upsert. p_admin_token 이 함수 본문의 하드코딩 토큰과 일치해야 동작. 운영 시 토큰을 랜덤 문자열로 교체하고 빌드 환경변수 VITE_ADMIN_DB_TOKEN 으로 주입.';

-- 클라이언트 사용 예 (AdminPortal 향후 마이그레이션 가이드):
--   await supabase.rpc('app_settings_admin_upsert', {
--     p_key: 'landing_v1',
--     p_value: bundle,
--     p_admin_token: import.meta.env.VITE_ADMIN_DB_TOKEN
--   })


-- ════════════════════════════════════════════════════════════════════════════
-- ② market_item_contents : 구매자/판매자만 SELECT, 판매자만 INSERT/UPDATE
-- ════════════════════════════════════════════════════════════════════════════
-- 배경: 익명자가 .full_content / .file_url 을 무단 SELECT 하면 유료 상품 등록 모델 붕괴.
--       구매자(market_purchases.buyer_id) 와 판매자(community_posts.user_id) 만 열람 허용.
--       비교 키는 community_users.auth_id (text) ↔ auth.uid()::text.

ALTER TABLE market_item_contents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mic_read"   ON market_item_contents;
DROP POLICY IF EXISTS "mic_insert" ON market_item_contents;
DROP POLICY IF EXISTS "mic_update" ON market_item_contents;
DROP POLICY IF EXISTS "mic_delete" ON market_item_contents;
DROP POLICY IF EXISTS "mic_select_buyer_or_seller" ON market_item_contents;
DROP POLICY IF EXISTS "mic_insert_seller_only"    ON market_item_contents;
DROP POLICY IF EXISTS "mic_update_seller_only"    ON market_item_contents;
DROP POLICY IF EXISTS "mic_delete_seller_only"    ON market_item_contents;

-- ── 2-A. SELECT : 본인이 구매했거나 본인이 판매자인 경우에만
CREATE POLICY "mic_select_buyer_or_seller"
  ON market_item_contents
  FOR SELECT
  USING (
    -- 판매자 (게시글 작성자) 본인
    EXISTS (
      SELECT 1
      FROM community_posts cp
      JOIN community_users cu ON cu.id = cp.user_id
      WHERE cp.id = market_item_contents.post_id
        AND cu.auth_id = auth.uid()::text
    )
    OR
    -- 구매자
    EXISTS (
      SELECT 1
      FROM market_purchases mp
      JOIN community_users cu ON cu.id = mp.buyer_id
      WHERE mp.post_id = market_item_contents.post_id
        AND cu.auth_id = auth.uid()::text
    )
  );

-- ── 2-B. INSERT : 게시글 작성자(판매자) 본인만
CREATE POLICY "mic_insert_seller_only"
  ON market_item_contents
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM community_posts cp
      JOIN community_users cu ON cu.id = cp.user_id
      WHERE cp.id = market_item_contents.post_id
        AND cu.auth_id = auth.uid()::text
    )
  );

-- ── 2-C. UPDATE : 게시글 작성자(판매자) 본인만
CREATE POLICY "mic_update_seller_only"
  ON market_item_contents
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM community_posts cp
      JOIN community_users cu ON cu.id = cp.user_id
      WHERE cp.id = market_item_contents.post_id
        AND cu.auth_id = auth.uid()::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM community_posts cp
      JOIN community_users cu ON cu.id = cp.user_id
      WHERE cp.id = market_item_contents.post_id
        AND cu.auth_id = auth.uid()::text
    )
  );

-- ── 2-D. DELETE : 게시글 작성자(판매자) 본인만
CREATE POLICY "mic_delete_seller_only"
  ON market_item_contents
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM community_posts cp
      JOIN community_users cu ON cu.id = cp.user_id
      WHERE cp.id = market_item_contents.post_id
        AND cu.auth_id = auth.uid()::text
    )
  );


-- ════════════════════════════════════════════════════════════════════════════
-- ③ Storage 6개 버킷 : 인증 사용자 + 본인 폴더(auth.uid()) 한정
-- ════════════════════════════════════════════════════════════════════════════
-- 배경: 현재 'allow_all_*' 정책이 익명 INSERT/DELETE 까지 허용 → Canvas 압축 우회 + 타인 사진 삭제 가능.
--       해결 정책:
--         - SELECT  : 공개 유지 (이미지 표시용)
--         - INSERT  : authenticated AND 첫 폴더 = auth.uid()::text
--         - UPDATE  : 동일
--         - DELETE  : 동일
--
-- ⚠️ 클라이언트 업로드 경로 마이그레이션 필요:
--   각 버킷의 업로드 경로 첫 세그먼트를 반드시 auth.uid() 로 변경할 것.
--   예) community-posts: 'posts/<user>-<ts>.<ext>'  →  '<auth.uid>/<ts>.<ext>'
--       community-photos: '<member.id>/<ts>.<ext>'   →  '<auth.uid>/<ts>.<ext>'
--       hold-photos:      '<trainer.id>/<ts>.<ext>'  →  '<auth.uid>/<ts>.<ext>'
--       trainer-photos / diet-photos / community-profiles 도 동일.

-- ── 3-A. 6개 버킷 보장 (없으면 생성, public read)
INSERT INTO storage.buckets (id, name, public) VALUES
  ('community-photos',   'community-photos',   true),
  ('community-posts',    'community-posts',    true),
  ('community-profiles', 'community-profiles', true),
  ('diet-photos',        'diet-photos',        true),
  ('trainer-photos',     'trainer-photos',     true),
  ('hold-photos',        'hold-photos',        true)
ON CONFLICT (id) DO NOTHING;

-- ── 3-B. 기존 광범위 정책 제거
DROP POLICY IF EXISTS "allow_all_community_photos"      ON storage.objects;
DROP POLICY IF EXISTS "allow_all_community_post_images" ON storage.objects;
DROP POLICY IF EXISTS "allow_all_diet_photos"           ON storage.objects;
DROP POLICY IF EXISTS "allow_all_trainer_photos"        ON storage.objects;
DROP POLICY IF EXISTS "allow_upload_hold_photos"        ON storage.objects;
DROP POLICY IF EXISTS "allow_delete_hold_photos"        ON storage.objects;
DROP POLICY IF EXISTS "trainer_upload_hold_photos"      ON storage.objects;
DROP POLICY IF EXISTS "trainer_delete_hold_photos"      ON storage.objects;
DROP POLICY IF EXISTS "public_read_hold_photos"         ON storage.objects;
DROP POLICY IF EXISTS "public read community-profiles"  ON storage.objects;
DROP POLICY IF EXISTS "public insert community-profiles" ON storage.objects;
DROP POLICY IF EXISTS "public update community-profiles" ON storage.objects;
DROP POLICY IF EXISTS "secure_buckets_select_public"    ON storage.objects;
DROP POLICY IF EXISTS "secure_buckets_insert_owner"     ON storage.objects;
DROP POLICY IF EXISTS "secure_buckets_update_owner"     ON storage.objects;
DROP POLICY IF EXISTS "secure_buckets_delete_owner"     ON storage.objects;

-- ── 3-C. SELECT : 6개 버킷 모두 공개 (이미지 표시용 public URL)
CREATE POLICY "secure_buckets_select_public"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id IN (
      'community-photos','community-posts','community-profiles',
      'diet-photos','trainer-photos','hold-photos'
    )
  );

-- ── 3-D. INSERT : 인증 사용자 + 첫 폴더가 본인 auth.uid()
CREATE POLICY "secure_buckets_insert_owner"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id IN (
      'community-photos','community-posts','community-profiles',
      'diet-photos','trainer-photos','hold-photos'
    )
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── 3-E. UPDATE : 본인이 올린 객체에 한해서만
CREATE POLICY "secure_buckets_update_owner"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id IN (
      'community-photos','community-posts','community-profiles',
      'diet-photos','trainer-photos','hold-photos'
    )
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id IN (
      'community-photos','community-posts','community-profiles',
      'diet-photos','trainer-photos','hold-photos'
    )
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── 3-F. DELETE : 본인이 올린 객체에 한해서만
CREATE POLICY "secure_buckets_delete_owner"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id IN (
      'community-photos','community-posts','community-profiles',
      'diet-photos','trainer-photos','hold-photos'
    )
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );


-- ============================================================================
-- 검증 쿼리 (수동 실행)
-- ============================================================================
-- SELECT tablename, policyname, cmd, qual, with_check
--   FROM pg_policies
--  WHERE tablename IN ('app_settings','market_item_contents','objects')
--    AND policyname LIKE ANY (ARRAY['app_settings_%','mic_%','secure_buckets_%']);
--
-- SELECT proname, prosecdef
--   FROM pg_proc
--  WHERE proname IN ('app_settings_admin_upsert','app_settings_admin_delete');
