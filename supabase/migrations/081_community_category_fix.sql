-- 081_community_category_fix.sql
-- 커뮤니티 카테고리 값이 프론트와 DB 가 서로 달라 글쓰기·마켓 교환이 실패하던 문제 수정.
--
-- 문제:
--   2026-05-07 프론트(CommunityPortal)가 카테고리를 새 이름으로 바꿈
--     trainer_hire / trainer_seek / gym_partner / education_hire
--     member_recruit / find_trainer
--     market_routine / market_program / market_nutrition / market_content
--   하지만 DB 쪽은 옛 이름 그대로:
--     - community_posts_category_check (20260428) 가 옛 8개 값만 허용 → 새 이름 글 INSERT 거부
--     - purchase_market_item (023) 이 category = 'educator_market' 만 찾음
--       → 프론트가 올린 market_* 상품은 무료여도 "상품을 찾을 수 없습니다" 로 교환 실패
--
-- 수정:
--   1. CHECK 제약을 옛 값 + 새 값 모두 허용으로 교체 (NOT VALID — 기존 행은 검사 안 함, 새 행만)
--   2. purchase_market_item 이 educator_market + market_* 4종 모두 허용
--      + 구매자를 로그인 세션(auth.uid())으로 확인 — 클라가 보낸 p_buyer_id 를 그대로 믿지 않음
--   시그니처·반환 형식 동일 → 클라이언트 수정 불필요.
--
-- 멱등: 여러 번 실행해도 결과 동일.

-- ============================================================
-- 1. category CHECK 제약 — 옛 값 + 새 값
-- ============================================================
ALTER TABLE community_posts
  DROP CONSTRAINT IF EXISTS community_posts_category_check;

ALTER TABLE community_posts
  ADD CONSTRAINT community_posts_category_check
  CHECK (category IN (
    -- 옛 값 (20260428) — 기존 데이터·routineTemplates.js 호환
    'trainer_lesson_recruit',
    'member_seeks_trainer',
    'instructor_seeks_student',
    'gym_seeks_trainer',
    'trainer_seeks_gym',
    'gym_partnership',
    'educator_course',
    'educator_market',
    -- 새 값 (CommunityPortal.jsx CAT)
    'trainer_hire',
    'trainer_seek',
    'gym_partner',
    'education_hire',
    'member_recruit',
    'find_trainer',
    'market_routine',
    'market_program',
    'market_nutrition',
    'market_content'
  )) NOT VALID;

-- ============================================================
-- 2. purchase_market_item — market_* 허용 + 세션 기반 구매자 확인
-- ============================================================
CREATE OR REPLACE FUNCTION purchase_market_item(
  p_post_id   uuid,
  p_buyer_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post      record;
  v_buyer_id  uuid;
  v_purchase  uuid;
BEGIN
  -- 로그인 세션의 커뮤니티 계정
  SELECT id INTO v_buyer_id
  FROM community_users
  WHERE auth_id = auth.uid()::text;

  IF v_buyer_id IS NULL OR v_buyer_id IS DISTINCT FROM p_buyer_id THEN
    RETURN jsonb_build_object('ok', false, 'error', '로그인 정보가 일치하지 않습니다');
  END IF;

  -- 상품 존재 확인
  SELECT id, user_id, price INTO v_post
  FROM community_posts
  WHERE id = p_post_id
    AND category IN ('educator_market',
                     'market_routine', 'market_program', 'market_nutrition', 'market_content')
    AND status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', '상품을 찾을 수 없습니다');
  END IF;

  -- 자기 상품 구매 방지
  IF v_post.user_id = v_buyer_id THEN
    RETURN jsonb_build_object('ok', false, 'error', '본인 상품은 구매할 수 없습니다');
  END IF;

  -- 중복 구매 확인
  IF EXISTS (SELECT 1 FROM market_purchases WHERE post_id = p_post_id AND buyer_id = v_buyer_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', '이미 구매한 상품입니다');
  END IF;

  -- 구매 처리
  INSERT INTO market_purchases (post_id, buyer_id, seller_id, amount_paid)
  VALUES (p_post_id, v_buyer_id, v_post.user_id, v_post.price)
  RETURNING id INTO v_purchase;

  RETURN jsonb_build_object('ok', true, 'purchase_id', v_purchase);
END;
$$;

REVOKE ALL ON FUNCTION purchase_market_item(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION purchase_market_item(uuid, uuid) TO authenticated;

-- ============================================================
-- 적용 후 확인 (SQL Editor 에서 따로 실행)
-- ============================================================
-- (a) 제약에 새 값이 들어갔는지 — 결과에 'market_routine' 이 보이면 OK
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE conname = 'community_posts_category_check';
--
-- (b) 지금까지 저장된 글의 카테고리 분포
-- SELECT category, status, count(*) FROM community_posts GROUP BY 1, 2 ORDER BY 3 DESC;
