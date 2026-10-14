-- 080_storage_policies_harden.sql
-- Storage(storage.objects) 정책 정리 — 누구나 파일 삭제·목록 조회가 가능하던 구멍 차단.
--
-- 발견(2026-10-14, Supabase Storage 화면 경고 "Clients can list all files in this bucket" 조사 중):
--   1) sig_delete_block — 이름은 '차단'이지만 PERMISSIVE 정책으로
--      USING (bucket_id <> 'contract-signatures') 를 role public 에 부여 →
--      contract-signatures 를 제외한 모든 버킷의 파일 삭제를 비로그인(anon)에게도 허용.
--      Storage 삭제는 SELECT 권한도 요구하는데, session-media / transformations / community-posts 는
--      SELECT 가 public 으로 열려 있어 → 공개 키만으로 수업 영상·비포애프터 사진 삭제 가능했음.
--   2) session-media / transformations / community-posts SELECT 가 public 전체 → 파일 목록 노출.
--   3) contract-signatures 버킷은 이미 없음 → 관련 정책 7개는 잔재.
--   4) community-posts INSERT 가 public → 비로그인 업로드 가능(저장 용량 남용 위험).
--
-- 원칙:
--   - 공개 버킷의 파일 '보기'는 공개 URL(/object/public/...)이라 RLS SELECT 가 필요 없음 → 앱 표시 영향 없음.
--   - SELECT 는 Storage API 의 list/remove 용 → '자기 파일'로만 좁힘(삭제가 계속 동작하도록).
--   - 경로 첫 폴더 기준: session-media = trainers.id, transformations = 트레이너 auth.uid,
--     community-posts = auth.uid.
--   - 판정은 SECURITY DEFINER 함수로 (테이블 RLS 와 무관하게 동작).
--
-- 손대지 않음: landing-assets (allow_all_landing_assets, ALL public)
--   → admin 포털이 anon 키로 업로드하므로 지금 막으면 랜딩 이미지 관리가 깨짐. admin 인증 개편 때 함께 정리.

-- ============================================================
-- 1. 판정 함수
-- ============================================================
CREATE OR REPLACE FUNCTION storage_is_own_trainer_folder(p_folder text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM trainers
     WHERE id::text = p_folder
       AND auth_id = auth.uid()
  );
$$;

-- 회원이 자기 비포애프터를 영구 삭제할 때(TransformationsShare.deleteForever) —
-- 파일은 트레이너 폴더에 있으므로, 그 사진이 연결된 member_transformations 의 회원 본인인지로 판정.
CREATE OR REPLACE FUNCTION storage_member_owns_transformation(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM member_transformations mt
      JOIN members m ON m.id = mt.member_id
     WHERE m.auth_id = auth.uid()
       AND (
         right(coalesce(mt.before_url, ''), length('/transformations/' || p_name)) = '/transformations/' || p_name
         OR right(coalesce(mt.after_url, ''), length('/transformations/' || p_name)) = '/transformations/' || p_name
       )
  );
$$;

REVOKE ALL ON FUNCTION storage_is_own_trainer_folder(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION storage_member_owns_transformation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION storage_is_own_trainer_folder(text) TO authenticated;
GRANT EXECUTE ON FUNCTION storage_member_owns_transformation(text) TO authenticated;

-- ============================================================
-- 2. 위험·잔재 정책 제거
-- ============================================================
DROP POLICY IF EXISTS "sig_delete_block"  ON storage.objects;
DROP POLICY IF EXISTS "cs_delete"         ON storage.objects;
DROP POLICY IF EXISTS "cs_read"           ON storage.objects;
DROP POLICY IF EXISTS "cs_upload"         ON storage.objects;
DROP POLICY IF EXISTS "sig_insert_open"   ON storage.objects;
DROP POLICY IF EXISTS "sig_select_open"   ON storage.objects;
DROP POLICY IF EXISTS "sig_update_open"   ON storage.objects;

-- ============================================================
-- 3. session-media (수업일지 사진·영상, 경로 = trainers.id/report_id/파일)
-- ============================================================
DROP POLICY IF EXISTS "session-media_select_policy" ON storage.objects;
DROP POLICY IF EXISTS "session-media_insert_policy" ON storage.objects;
DROP POLICY IF EXISTS "session_media_insert_own"    ON storage.objects;
DROP POLICY IF EXISTS "session_media_select_own"    ON storage.objects;
DROP POLICY IF EXISTS "session_media_delete_own"    ON storage.objects;

CREATE POLICY "session_media_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'session-media'
              AND storage_is_own_trainer_folder((storage.foldername(name))[1]));

CREATE POLICY "session_media_select_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'session-media'
         AND storage_is_own_trainer_folder((storage.foldername(name))[1]));

CREATE POLICY "session_media_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'session-media'
         AND storage_is_own_trainer_folder((storage.foldername(name))[1]));

-- ============================================================
-- 4. transformations (비포애프터, 경로 = 트레이너 auth.uid/파일)
--    기존 transformations_write / transformations_delete (첫 폴더 = auth.uid) 는 유지.
-- ============================================================
DROP POLICY IF EXISTS "transformations_read"           ON storage.objects;
DROP POLICY IF EXISTS "transformations_select_own"     ON storage.objects;
DROP POLICY IF EXISTS "transformations_delete_member"  ON storage.objects;

CREATE POLICY "transformations_select_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'transformations'
         AND ((storage.foldername(name))[1] = auth.uid()::text
              OR storage_member_owns_transformation(name)));

CREATE POLICY "transformations_delete_member" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'transformations'
         AND storage_member_owns_transformation(name));

-- ============================================================
-- 5. community-posts (경로 = auth.uid/파일, 운영에선 커뮤니티 비공개)
-- ============================================================
DROP POLICY IF EXISTS "allow read 1glw6b3_0"          ON storage.objects;
DROP POLICY IF EXISTS "allow upload 1glw6b3_0"        ON storage.objects;
DROP POLICY IF EXISTS "community_posts_insert_own"    ON storage.objects;

CREATE POLICY "community_posts_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'community-posts'
              AND (storage.foldername(name))[1] = auth.uid()::text);
