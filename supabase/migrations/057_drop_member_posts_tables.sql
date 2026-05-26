-- 057_drop_member_posts_tables.sql
-- 회원앱 커뮤니티 탭 제거에 따른 정리.
--
-- 배경:
--   회원앱(MemberPortal)의 커뮤니티 탭(공지 목록 + 자유게시판)을 제거함
--   (트레이너 앱처럼 입장 공지 LoginNoticeModal 로 일원화). 그 결과
--   member_posts / member_reactions 는 더 이상 어떤 앱도 사용하지 않는다.
--   이 두 테이블은 015 에서 allow_all 정책으로 만들어져 anon 에 노출돼 있었고,
--   기능 제거 후엔 잔여 데이터만 남는 누출 표면이 된다.
--
--   잔여 데이터가 불필요하다는 사용자 합의에 따라, 056(RLS 잠금) 대신
--   테이블째 제거해 데이터 + 누출 표면을 동시에 정리한다.
--   (056_member_posts_rls.sql 은 superseded — 적용/머지하지 않음)
--
-- ⚠️ 파괴적: 두 테이블의 모든 행이 영구 삭제됨.
--   삭제 전 확인하고 싶으면:
--     SELECT count(*) FROM member_posts;      -- 0 이면 안심
--     SELECT count(*) FROM member_reactions;
--
-- 참고(선택): member_posts 사진은 'community-photos' 스토리지 버킷에 남는다.
--   고아 파일이 신경 쓰이면 Storage 에서 별도 정리 (기능상 무해).

DROP TABLE IF EXISTS member_reactions;  -- 자식(FK → member_posts) 먼저
DROP TABLE IF EXISTS member_posts;
