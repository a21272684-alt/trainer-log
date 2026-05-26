-- 058_drop_community_photos_bucket.sql
-- 회원앱 커뮤니티 탭 + member_posts/reactions 테이블 제거(057) 이후 스토리지 정리.
--
-- 배경:
--   'community-photos' 버킷은 013/015 에서 회원 피드 사진용으로 생성됐으나,
--   회원앱 커뮤니티 탭 제거 후엔 어떤 앱 코드도 이 버킷을 참조하지 않는다
--   (CommunityPortal 은 community-posts / community-profiles 버킷 사용).
--   완전 고아 상태 → 잔여 파일 + 누출 표면(allow_all 정책) 정리.
--
-- ⚠️ 파괴적: 이 버킷의 모든 객체(메타데이터) 삭제.
--   실제 파일 블롭까지 확실히 비우려면, 먼저 Supabase Dashboard > Storage 에서
--   community-photos 의 파일을 삭제한 뒤 본 마이그레이션을 실행하는 것을 권장.

-- 1. 버킷 내 객체 제거 (버킷 삭제 전 FK 충돌 방지)
DELETE FROM storage.objects WHERE bucket_id = 'community-photos';

-- 2. 고아 스토리지 정책 제거
DROP POLICY IF EXISTS "allow_all_community_photos" ON storage.objects;

-- 3. 버킷 제거
DELETE FROM storage.buckets WHERE id = 'community-photos';
