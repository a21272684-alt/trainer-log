-- 099 관리자 개편 2차
--  · 홈 요약 (오늘 처리할 일 + 월별 가입 추이)
--  · 회원 서버 검색 (100명 제한 해소, 트레이너별 보기)
--  · 수업일지 기간 통계 (서버 집계)
--  · 커뮤니티 목록/조치 — RLS 로 anon 직접 조회가 0명으로 보이던 문제 → 토큰 가드 RPC
--  · 공지사항 쓰기 — notices 쓰기 정책이 service_role 전용이라 관리자 저장이 막혀 있던 문제 → 토큰 가드 RPC
-- 모든 함수: SECURITY DEFINER + _admin_assert(관리자 토큰) + anon/authenticated 실행 권한.

-- ─────────────────────────────────────────────
-- 1. 홈 요약
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_home_overview(p_admin_token text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Seoul')::date;
  v_res   jsonb;
BEGIN
  PERFORM _admin_assert(p_admin_token);

  WITH cur AS (   -- 트레이너별 현재 구독(무효 제외, 가장 늦은 만료일)
    SELECT DISTINCT ON (s.trainer_id) s.trainer_id, s.plan, s.valid_until, s.stopped_at
      FROM subscriptions s
     WHERE s.voided_at IS NULL
     ORDER BY s.trainer_id, s.valid_until DESC NULLS LAST, s.paid_at DESC NULLS LAST
  ), months AS (
    SELECT to_char(d, 'YYYY-MM') AS ym
      FROM generate_series(date_trunc('month', v_today) - interval '11 months', date_trunc('month', v_today), interval '1 month') d
  )
  SELECT jsonb_build_object(
    'today', v_today,
    'counts', jsonb_build_object(
      'trainers',        (SELECT count(*) FROM trainers),
      'members',         (SELECT count(*) FROM members),
      'logs',            (SELECT count(*) FROM logs),
      'logs_today',      (SELECT count(*) FROM logs WHERE (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date = v_today),
      'active_trainers_7d', (SELECT count(DISTINCT trainer_id) FROM logs WHERE created_at > (now() AT TIME ZONE 'UTC') - interval '7 days'),
      'subscribed',      (SELECT count(*) FROM cur WHERE valid_until >= v_today),
      'community_users', (SELECT count(*) FROM community_users),
      'crm_trainers',    (SELECT count(*) FROM trainers t WHERE COALESCE((t.crm_permissions->>'crm_access')::boolean, (t.crm_permissions->>'enabled')::boolean, false))
    ),
    'todo', jsonb_build_object(
      'signups_pending',  (SELECT count(*) FROM trainer_signup_requests WHERE status = 'pending'),
      'subs_soon',        (SELECT count(*) FROM cur WHERE valid_until BETWEEN v_today AND v_today + 7),
      'subs_expired_7d',  (SELECT count(*) FROM cur WHERE valid_until BETWEEN v_today - 7 AND v_today - 1),
      'reports_pending',  (SELECT count(*) FROM community_reports WHERE resolved_at IS NULL),
      'contacts_pending', (SELECT count(*) FROM community_contacts WHERE status = 'pending')
    ),
    'soon_list', COALESCE((
      SELECT jsonb_agg(x ORDER BY x->>'valid_until') FROM (
        SELECT jsonb_build_object('trainer_id', c.trainer_id, 'name', t.name, 'plan', c.plan, 'valid_until', c.valid_until) AS x
          FROM cur c JOIN trainers t ON t.id = c.trainer_id
         WHERE c.valid_until BETWEEN v_today - 7 AND v_today + 7
         ORDER BY c.valid_until LIMIT 8) q), '[]'::jsonb),
    'monthly', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'ym', m.ym,
               -- created_at 은 timestamp(UTC 기준) → 서울 시각으로 변환 후 월 비교
               'trainers', (SELECT count(*) FROM trainers t WHERE to_char(t.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul', 'YYYY-MM') = m.ym),
               'members',  (SELECT count(*) FROM members  x WHERE to_char(x.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul', 'YYYY-MM') = m.ym))
             ORDER BY m.ym)
        FROM months m), '[]'::jsonb),
    'recent_logs', COALESCE((
      SELECT jsonb_agg(r ORDER BY r->>'created_at' DESC) FROM (
        SELECT jsonb_build_object('id', l.id, 'created_at', l.created_at, 'session_number', l.session_number,
                                  'trainer_id', l.trainer_id, 'trainer_name', t.name, 'member_name', mm.name) AS r
          FROM logs l
          LEFT JOIN trainers t ON t.id = l.trainer_id
          LEFT JOIN members mm ON mm.id = l.member_id
         ORDER BY l.created_at DESC LIMIT 6) q), '[]'::jsonb)
  ) INTO v_res;
  RETURN v_res;
END;
$$;

-- ─────────────────────────────────────────────
-- 2. 회원 서버 검색 (이름 · 초성 · 전화 뒷자리 · 트레이너 이름)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_search_members(
  p_admin_token text,
  p_query       text    DEFAULT NULL,
  p_trainer_id  uuid    DEFAULT NULL,
  p_sort        text    DEFAULT 'recent',   -- recent | name | sessions
  p_limit       integer DEFAULT 20,
  p_offset      integer DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_q      text := NULLIF(btrim(COALESCE(p_query, '')), '');
  v_digits text;
  v_limit  integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  v_res    jsonb;
BEGIN
  PERFORM _admin_assert(p_admin_token);
  IF v_q ~ '^[0-9\- ]{4,}$' THEN v_digits := regexp_replace(v_q, '[^0-9]', '', 'g'); END IF;

  WITH base AS (
    SELECT m.id, m.name, m.trainer_id, t.name AS trainer_name, m.lesson_purpose,
           COALESCE(m.done_sessions, 0) AS done_sessions, COALESCE(m.total_sessions, 0) AS total_sessions,
           m.created_at, COALESCE(m.suspended, false) AS suspended,
           right(regexp_replace(COALESCE(m.phone, ''), '[^0-9]', '', 'g'), 4) AS phone_tail,
           (SELECT max(l.created_at) FROM logs l WHERE l.member_id = m.id) AS last_log_at
      FROM members m
      LEFT JOIN trainers t ON t.id = m.trainer_id
     WHERE (p_trainer_id IS NULL OR m.trainer_id = p_trainer_id)
       AND (v_q IS NULL
            OR _admin_text_match(v_q, m.name, t.name)
            OR (v_digits IS NOT NULL AND position(v_digits IN regexp_replace(COALESCE(m.phone, ''), '[^0-9]', '', 'g')) > 0))
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM base),
    'rows', COALESCE((
      SELECT jsonb_agg(to_jsonb(b)) FROM (
        SELECT * FROM base
         ORDER BY
           CASE WHEN p_sort = 'name' THEN name END ASC,
           CASE WHEN p_sort = 'sessions' THEN done_sessions END DESC,
           created_at DESC NULLS LAST, id
         LIMIT v_limit OFFSET GREATEST(COALESCE(p_offset, 0), 0)) b), '[]'::jsonb)
  ) INTO v_res;
  RETURN v_res;
END;
$$;

-- ─────────────────────────────────────────────
-- 3. 수업일지 기간 통계
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_log_stats(
  p_admin_token text,
  p_period      text    DEFAULT 'week',  -- day | week | month
  p_query       text    DEFAULT NULL,
  p_limit       integer DEFAULT 20,
  p_offset      integer DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Seoul')::date;
  v_from  date;
  v_days  integer;
  v_q     text := NULLIF(btrim(COALESCE(p_query, '')), '');
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  v_res   jsonb;
BEGIN
  PERFORM _admin_assert(p_admin_token);
  v_from := CASE p_period WHEN 'day' THEN v_today WHEN 'month' THEN date_trunc('month', v_today)::date ELSE v_today - 6 END;
  v_days := CASE p_period WHEN 'month' THEN 30 ELSE 14 END;

  WITH l AS (   -- logs.created_at 은 timestamp(UTC 기준) → 서울 날짜로 변환
    SELECT id, trainer_id, member_id, (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date AS d, created_at
      FROM logs
  ), per AS (
    SELECT t.id, t.name, t.email,
           count(l.id) FILTER (WHERE l.d >= v_from)                     AS period_count,
           count(DISTINCT l.member_id) FILTER (WHERE l.d >= v_from)     AS period_members,
           count(l.id)                                                  AS total_count,
           max(l.created_at)                                            AS last_log_at
      FROM trainers t LEFT JOIN l ON l.trainer_id = t.id
     WHERE v_q IS NULL OR _admin_text_match(v_q, t.name, t.email)
     GROUP BY t.id
  )
  SELECT jsonb_build_object(
    'from', v_from,
    'summary', jsonb_build_object(
      'logs',     (SELECT count(*) FROM l WHERE d >= v_from),
      'trainers', (SELECT count(DISTINCT trainer_id) FROM l WHERE d >= v_from),
      'members',  (SELECT count(DISTINCT member_id) FROM l WHERE d >= v_from),
      'all_time', (SELECT count(*) FROM l)),
    'daily', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('d', g.d, 'n', (SELECT count(*) FROM l WHERE l.d = g.d)) ORDER BY g.d)
        FROM (SELECT generate_series(v_today - (v_days - 1), v_today, interval '1 day')::date AS d) g), '[]'::jsonb),
    'total', (SELECT count(*) FROM per),
    'rows', COALESCE((
      SELECT jsonb_agg(to_jsonb(p)) FROM (
        SELECT * FROM per ORDER BY period_count DESC, last_log_at DESC NULLS LAST, name
         LIMIT v_limit OFFSET GREATEST(COALESCE(p_offset, 0), 0)) p), '[]'::jsonb)
  ) INTO v_res;
  RETURN v_res;
END;
$$;

-- ─────────────────────────────────────────────
-- 4. 커뮤니티 — 목록 (유저 · 게시글 · 연락요청 · 마켓 거래)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_community_list(
  p_admin_token text,
  p_kind        text,                    -- users | posts | contacts | market
  p_query       text    DEFAULT NULL,
  p_limit       integer DEFAULT 20,
  p_offset      integer DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_q      text := NULLIF(btrim(COALESCE(p_query, '')), '');
  v_limit  integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  v_off    integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_total  bigint;
  v_rows   jsonb;
BEGIN
  PERFORM _admin_assert(p_admin_token);

  IF p_kind = 'users' THEN
    SELECT count(*) INTO v_total FROM community_users u WHERE v_q IS NULL OR _admin_text_match(v_q, u.name, u.location);
    SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) INTO v_rows FROM (
      SELECT u.id, u.name, u.role, u.location, u.bio, u.created_at, u.avatar_url,
             COALESCE(u.admin_permissions, '{}'::jsonb) AS admin_permissions,
             (SELECT count(*) FROM community_posts p WHERE p.user_id = u.id) AS post_count
        FROM community_users u
       WHERE v_q IS NULL OR _admin_text_match(v_q, u.name, u.location)
       ORDER BY u.created_at DESC LIMIT v_limit OFFSET v_off) r;

  ELSIF p_kind = 'posts' THEN
    SELECT count(*) INTO v_total FROM community_posts p LEFT JOIN community_users a ON a.id = p.user_id
     WHERE v_q IS NULL OR _admin_text_match(v_q, p.title, a.name);
    SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) INTO v_rows FROM (
      SELECT p.id, p.title, p.category, p.location, p.status, p.contact_count, p.created_at, p.price, p.user_id,
             p.hidden_reason, a.name AS author_name, a.role AS author_role
        FROM community_posts p LEFT JOIN community_users a ON a.id = p.user_id
       WHERE v_q IS NULL OR _admin_text_match(v_q, p.title, a.name)
       ORDER BY p.created_at DESC LIMIT v_limit OFFSET v_off) r;

  ELSIF p_kind = 'contacts' THEN
    SELECT count(*) INTO v_total FROM community_contacts c LEFT JOIN community_users q ON q.id = c.requester_id
      LEFT JOIN community_posts p ON p.id = c.post_id
     WHERE v_q IS NULL OR _admin_text_match(v_q, q.name, p.title);
    SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) INTO v_rows FROM (
      SELECT c.id, c.message, c.status, c.created_at, q.name AS requester_name, q.role AS requester_role, p.title AS post_title
        FROM community_contacts c
        LEFT JOIN community_users q ON q.id = c.requester_id
        LEFT JOIN community_posts p ON p.id = c.post_id
       WHERE v_q IS NULL OR _admin_text_match(v_q, q.name, p.title)
       ORDER BY c.created_at DESC LIMIT v_limit OFFSET v_off) r;

  ELSIF p_kind = 'market' THEN
    SELECT count(*) INTO v_total FROM market_purchases;
    SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) INTO v_rows FROM (
      SELECT mp.id, mp.amount_paid, mp.purchased_at, p.title AS item_title, p.price AS item_price,
             s.name AS seller_name, s.role AS seller_role, b.name AS buyer_name, b.role AS buyer_role
        FROM market_purchases mp
        LEFT JOIN community_posts p ON p.id = mp.post_id
        LEFT JOIN community_users s ON s.id = mp.seller_id
        LEFT JOIN community_users b ON b.id = mp.buyer_id
       ORDER BY mp.purchased_at DESC LIMIT v_limit OFFSET v_off) r;
  ELSE
    RAISE EXCEPTION '알 수 없는 목록: %', p_kind;
  END IF;

  RETURN jsonb_build_object(
    'total', v_total,
    'rows', v_rows,
    'stats', jsonb_build_object(
      'users',            (SELECT count(*) FROM community_users),
      'posts_active',     (SELECT count(*) FROM community_posts WHERE status = 'active'),
      'posts',            (SELECT count(*) FROM community_posts),
      'contacts_pending', (SELECT count(*) FROM community_contacts WHERE status = 'pending'),
      'contacts_accepted',(SELECT count(*) FROM community_contacts WHERE status = 'accepted'),
      'reports_pending',  (SELECT count(*) FROM community_reports WHERE resolved_at IS NULL)));
END;
$$;

-- 4-B. 게시글 마감 / 삭제
CREATE OR REPLACE FUNCTION admin_community_post_action(p_admin_token text, p_post_id uuid, p_action text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM _admin_assert(p_admin_token);
  IF p_action = 'close' THEN
    UPDATE community_posts SET status = 'closed' WHERE id = p_post_id;
  ELSIF p_action = 'delete' THEN
    DELETE FROM community_posts WHERE id = p_post_id;
  ELSE
    RAISE EXCEPTION '알 수 없는 조치: %', p_action;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION '게시글을 찾을 수 없어요'; END IF;
END;
$$;

-- 4-C. 유저 권한 저장 / 삭제
CREATE OR REPLACE FUNCTION admin_community_user_perms(p_admin_token text, p_user_id uuid, p_perms jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM _admin_assert(p_admin_token);
  IF p_perms IS NULL OR jsonb_typeof(p_perms) <> 'object' THEN RAISE EXCEPTION '권한 형식이 올바르지 않아요'; END IF;
  UPDATE community_users SET admin_permissions = p_perms WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION '유저를 찾을 수 없어요'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION admin_community_user_delete(p_admin_token text, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM _admin_assert(p_admin_token);
  DELETE FROM community_users WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION '유저를 찾을 수 없어요'; END IF;
END;
$$;

-- ─────────────────────────────────────────────
-- 5. 공지사항 (관리자 공지 = trainer_id 없는 공지)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_notice_save(
  p_admin_token text, p_id uuid, p_title text, p_content text, p_is_pinned boolean
) RETURNS notices
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_title   text := NULLIF(btrim(COALESCE(p_title, '')), '');
  v_content text := NULLIF(btrim(COALESCE(p_content, '')), '');
  v_row     notices;
BEGIN
  PERFORM _admin_assert(p_admin_token);
  IF v_title IS NULL THEN RAISE EXCEPTION '제목을 입력해 주세요'; END IF;
  IF v_content IS NULL THEN RAISE EXCEPTION '내용을 입력해 주세요'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO notices (title, content, is_pinned, author_name)
    VALUES (v_title, v_content, COALESCE(p_is_pinned, false), '관리자') RETURNING * INTO v_row;
  ELSE
    UPDATE notices SET title = v_title, content = v_content, is_pinned = COALESCE(p_is_pinned, false), updated_at = now()
     WHERE id = p_id AND trainer_id IS NULL RETURNING * INTO v_row;
    IF NOT FOUND THEN RAISE EXCEPTION '공지를 찾을 수 없어요'; END IF;
  END IF;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION admin_notice_delete(p_admin_token text, p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM _admin_assert(p_admin_token);
  DELETE FROM notices WHERE id = p_id AND trainer_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION '공지를 찾을 수 없어요'; END IF;
END;
$$;

-- ─────────────────────────────────────────────
-- 6. 실행 권한
-- ─────────────────────────────────────────────
REVOKE ALL ON FUNCTION admin_home_overview(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_search_members(text, text, uuid, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_log_stats(text, text, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_community_list(text, text, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_community_post_action(text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_community_user_perms(text, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_community_user_delete(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_notice_save(text, uuid, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_notice_delete(text, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION admin_home_overview(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_search_members(text, text, uuid, text, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_log_stats(text, text, text, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_community_list(text, text, text, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_community_post_action(text, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_community_user_perms(text, uuid, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_community_user_delete(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_notice_save(text, uuid, text, text, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_notice_delete(text, uuid) TO anon, authenticated;
