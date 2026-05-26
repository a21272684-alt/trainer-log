-- 058_drop_community_photos_bucket.sql
-- 회원앱 커뮤니티 탭 + member_posts/reactions(057) 제거 후속 — community-photos 정리.
--
-- 배경:
--   'community-photos' 버킷(013/015 회원 피드 사진용)은 회원앱 커뮤니티 탭
--   제거 후 어떤 앱도 참조하지 않는 고아 상태. 파일 + 버킷 + 정책을 정리.
--
-- ⚠️ Supabase 는 storage.objects / storage.buckets 의 직접 SQL DELETE 를
--    storage.protect_delete() 트리거로 차단한다 (고아 파일로 인한 사고 방지).
--    → 파일·버킷 삭제는 SQL 이 아니라 Dashboard(Storage) 또는 Storage API 로 수행.
--    본 마이그레이션은 SQL 로 가능한 "정책 제거"만 담는다.
--
-- 실제 적용 절차 (2026-05-26 수행 완료):
--   1) Dashboard > Storage > community-photos: 파일 전체 삭제
--   2) Dashboard > Storage: community-photos 버킷 삭제
--   3) 아래 SQL: 고아 스토리지 정책 제거

DROP POLICY IF EXISTS "allow_all_community_photos" ON storage.objects;
