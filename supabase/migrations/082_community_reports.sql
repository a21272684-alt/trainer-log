-- 082_community_reports.sql
-- 커뮤니티 신고 시스템 + 작성자 제재(경고 / 7일 정지 / 영구 정지).
--
-- 동작:
--   - 회원이 글을 신고 (사유 7종 + 메모). 한 사람은 같은 글 1번만.
--   - 처리 안 된 신고가 3건 쌓이면 글 자동 숨김 (status = 'hidden'). 자동 삭제는 없음.
--   - 숨김 글은 작성자 본인에게만 보이고, 사유(hidden_reason)가 함께 표시됨.
--   - admin 이 신고함에서 처리: keep(다시 공개) / warn(경고) / d7(7일 정지) / perm(영구 정지).
--     warn/d7/perm 은 글 삭제(status = 'removed') + 위반 횟수 +1.
--   - 정지 중인 사람은 글쓰기·연락 요청 불가 (RLS). 글 읽기는 가능.
--
-- 보안:
--   - 제재 정보는 별도 테이블(community_user_status) — 본인 조회만, 클라 쓰기 정책 없음.
--     (community_users 는 본인 UPDATE 가 허용돼 있어 거기 두면 스스로 풀 수 있음)
--   - 작성자가 자기 글의 hidden/removed 상태나 hidden_reason 을 직접 바꾸지 못하게 트리거로 막음.
--     신고·admin RPC 안에서만 app.moderation = on 으로 변경 허용.
--
-- 멱등: 여러 번 실행해도 결과 동일.

-- ============================================================
-- 1. community_posts — status 값 확장 + 숨김 사유
-- ============================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'community_posts'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE community_posts DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE community_posts
  ADD CONSTRAINT community_posts_status_check
  CHECK (status IN ('active', 'closed', 'hidden', 'removed')) NOT VALID;

ALTER TABLE community_posts
  ADD COLUMN IF NOT EXISTS hidden_reason text;

COMMENT ON COLUMN community_posts.hidden_reason IS
  '자동 숨김·삭제 시 가장 많이 신고된 사유 키 (community_reports.reason). 작성자에게 표시.';

-- ============================================================
-- 2. community_reports — 신고
-- ============================================================
CREATE TABLE IF NOT EXISTS community_reports (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     uuid        NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  reporter_id uuid        NOT NULL REFERENCES community_users(id) ON DELETE CASCADE,
  reason      text        NOT NULL CHECK (reason IN
                ('fake_job', 'scam', 'copyright', 'spam', 'abuse', 'offtopic', 'etc')),
  memo        text        CHECK (memo IS NULL OR char_length(memo) <= 500),
  created_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolution  text        CHECK (resolution IS NULL OR resolution IN ('keep', 'warn', 'd7', 'perm')),
  UNIQUE (post_id, reporter_id)
);

CREATE INDEX IF NOT EXISTS idx_community_reports_open
  ON community_reports (post_id) WHERE resolved_at IS NULL;

-- 클라이언트 직접 접근 없음 (RPC 전용). 정책 없이 RLS 만 켬 → 전부 거부.
ALTER TABLE community_reports ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. community_user_status — 위반 횟수·정지
-- ============================================================
CREATE TABLE IF NOT EXISTS community_user_status (
  user_id         uuid        PRIMARY KEY REFERENCES community_users(id) ON DELETE CASCADE,
  strikes         integer     NOT NULL DEFAULT 0,
  suspended_until timestamptz,                       -- 'infinity' = 영구 정지
  last_action     text        CHECK (last_action IS NULL OR last_action IN ('warn', 'd7', 'perm')),
  last_reason     text,
  last_at         timestamptz,
  last_seen       boolean     NOT NULL DEFAULT true  -- false 면 커뮤니티에 안내 배너 표시
);

ALTER TABLE community_user_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "community_user_status_select_self" ON community_user_status;
CREATE POLICY "community_user_status_select_self" ON community_user_status
  FOR SELECT TO authenticated
  USING (user_id IN (SELECT id FROM community_users WHERE auth_id = auth.uid()::text));

-- 현재 로그인 사용자가 정지 중인지
CREATE OR REPLACE FUNCTION community_is_suspended()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM community_user_status s
    JOIN community_users u ON u.id = s.user_id
    WHERE u.auth_id = auth.uid()::text
      AND s.suspended_until > now()
  );
$$;

REVOKE ALL ON FUNCTION community_is_suspended() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION community_is_suspended() TO authenticated;

-- ============================================================
-- 4. RLS — 숨김·삭제 글은 작성자만, 정지 중엔 글쓰기·연락 불가
-- ============================================================
DROP POLICY IF EXISTS "community_posts_select" ON community_posts;
CREATE POLICY "community_posts_select" ON community_posts
  FOR SELECT TO authenticated
  USING (
    status IN ('active', 'closed')
    OR user_id IN (SELECT id FROM community_users WHERE auth_id = auth.uid()::text)
  );

DROP POLICY IF EXISTS "community_posts_insert" ON community_posts;
CREATE POLICY "community_posts_insert" ON community_posts
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id IN (SELECT id FROM community_users WHERE auth_id = auth.uid()::text)
    AND NOT community_is_suspended()
  );

DROP POLICY IF EXISTS "community_contacts_insert" ON community_contacts;
CREATE POLICY "community_contacts_insert" ON community_contacts
  FOR INSERT TO authenticated
  WITH CHECK (
    requester_id IN (SELECT id FROM community_users WHERE auth_id = auth.uid()::text)
    AND NOT community_is_suspended()
  );

-- ============================================================
-- 5. 트리거 — 작성자가 숨김·삭제 상태를 직접 풀지 못하게
-- ============================================================
CREATE OR REPLACE FUNCTION community_posts_moderation_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('app.moderation', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF OLD.status IN ('hidden', 'removed') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION '운영자 확인 중인 글은 상태를 바꿀 수 없어요' USING ERRCODE = '42501';
  END IF;
  IF NEW.status IN ('hidden', 'removed') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION '이 상태로는 직접 바꿀 수 없어요' USING ERRCODE = '42501';
  END IF;
  IF NEW.hidden_reason IS DISTINCT FROM OLD.hidden_reason THEN
    RAISE EXCEPTION '숨김 사유는 직접 바꿀 수 없어요' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_posts_moderation_guard ON community_posts;
CREATE TRIGGER trg_community_posts_moderation_guard
  BEFORE UPDATE ON community_posts
  FOR EACH ROW
  EXECUTE FUNCTION community_posts_moderation_guard();

-- 새 글을 hidden/removed 로 바로 넣는 것도 막음
CREATE OR REPLACE FUNCTION community_posts_insert_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IN ('hidden', 'removed') OR NEW.hidden_reason IS NOT NULL THEN
    RAISE EXCEPTION '이 상태로는 글을 등록할 수 없어요' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_posts_insert_guard ON community_posts;
CREATE TRIGGER trg_community_posts_insert_guard
  BEFORE INSERT ON community_posts
  FOR EACH ROW
  EXECUTE FUNCTION community_posts_insert_guard();

-- 처리 안 된 신고 중 가장 많은 사유
CREATE OR REPLACE FUNCTION _community_top_reason(p_post_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT reason FROM community_reports
  WHERE post_id = p_post_id AND resolved_at IS NULL
  GROUP BY reason
  ORDER BY count(*) DESC, max(created_at) DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION _community_top_reason(uuid) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 6. RPC — 회원: 신고하기
-- ============================================================
CREATE OR REPLACE FUNCTION community_report_post(
  p_post_id uuid,
  p_reason  text,
  p_memo    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     uuid;
  v_post   record;
  v_count  integer;
  v_hidden boolean := false;
BEGIN
  SELECT id INTO v_me FROM community_users WHERE auth_id = auth.uid()::text;
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', '로그인이 필요해요');
  END IF;

  IF p_reason NOT IN ('fake_job', 'scam', 'copyright', 'spam', 'abuse', 'offtopic', 'etc') THEN
    RETURN jsonb_build_object('ok', false, 'error', '신고 사유를 골라주세요');
  END IF;

  SELECT id, user_id, status INTO v_post FROM community_posts WHERE id = p_post_id;
  IF NOT FOUND OR v_post.status NOT IN ('active', 'closed', 'hidden') THEN
    RETURN jsonb_build_object('ok', false, 'error', '글을 찾을 수 없어요');
  END IF;
  IF v_post.user_id = v_me THEN
    RETURN jsonb_build_object('ok', false, 'error', '내 글은 신고할 수 없어요');
  END IF;

  INSERT INTO community_reports (post_id, reporter_id, reason, memo)
  VALUES (p_post_id, v_me, p_reason, nullif(left(trim(coalesce(p_memo, '')), 500), ''))
  ON CONFLICT (post_id, reporter_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', '이미 신고한 글이에요');
  END IF;

  SELECT count(*) INTO v_count
  FROM community_reports WHERE post_id = p_post_id AND resolved_at IS NULL;

  IF v_count >= 3 AND v_post.status IN ('active', 'closed') THEN
    PERFORM set_config('app.moderation', 'on', true);
    UPDATE community_posts
       SET status = 'hidden', hidden_reason = _community_top_reason(p_post_id)
     WHERE id = p_post_id;
    v_hidden := true;
  END IF;

  RETURN jsonb_build_object('ok', true, 'hidden', v_hidden);
END;
$$;

REVOKE ALL ON FUNCTION community_report_post(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION community_report_post(uuid, text, text) TO authenticated;

-- 회원: 제재 안내 배너 확인 처리
CREATE OR REPLACE FUNCTION community_ack_sanction()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE community_user_status s
     SET last_seen = true
    FROM community_users u
   WHERE u.id = s.user_id AND u.auth_id = auth.uid()::text;
$$;

REVOKE ALL ON FUNCTION community_ack_sanction() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION community_ack_sanction() TO authenticated;

-- ============================================================
-- 7. RPC — admin: 신고함 목록
-- ============================================================
-- p_include_resolved = false → 처리 대기 글만 / true → 최근 30일 처리분 포함
CREATE OR REPLACE FUNCTION admin_list_community_reports(
  p_admin_token      text,
  p_include_resolved boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM _admin_assert(p_admin_token);

  WITH targets AS (
    SELECT r.post_id,
           bool_or(r.resolved_at IS NULL)                         AS is_open,
           max(r.created_at)                                      AS last_reported_at
    FROM community_reports r
    GROUP BY r.post_id
    HAVING bool_or(r.resolved_at IS NULL)
        OR (p_include_resolved AND max(r.resolved_at) > now() - interval '30 days')
  )
  SELECT coalesce(jsonb_agg(item ORDER BY (item->>'is_open')::boolean DESC, item->>'last_reported_at' DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'post_id',          p.id,
      'title',            p.title,
      'content',          left(p.content, 300),
      'category',         p.category,
      'status',           p.status,
      'hidden_reason',    p.hidden_reason,
      'author_id',        p.user_id,
      'author_name',      u.name,
      'strikes',          coalesce(s.strikes, 0),
      'suspended_until',  s.suspended_until,
      'is_open',          t.is_open,
      'last_reported_at', t.last_reported_at,
      'open_count',       (SELECT count(*) FROM community_reports x
                            WHERE x.post_id = p.id AND x.resolved_at IS NULL),
      'reasons',          (SELECT coalesce(jsonb_object_agg(reason, n), '{}'::jsonb) FROM (
                             SELECT reason, count(*) AS n FROM community_reports x
                             WHERE x.post_id = p.id
                               AND (x.resolved_at IS NULL OR NOT t.is_open)
                             GROUP BY reason) z),
      'memos',            (SELECT coalesce(jsonb_agg(memo ORDER BY created_at DESC), '[]'::jsonb)
                             FROM community_reports x
                            WHERE x.post_id = p.id AND x.memo IS NOT NULL
                              AND (x.resolved_at IS NULL OR NOT t.is_open)),
      'resolution',       (SELECT resolution FROM community_reports x
                            WHERE x.post_id = p.id AND x.resolved_at IS NOT NULL
                            ORDER BY resolved_at DESC LIMIT 1)
    ) AS item
    FROM targets t
    JOIN community_posts p ON p.id = t.post_id
    LEFT JOIN community_users u ON u.id = p.user_id
    LEFT JOIN community_user_status s ON s.user_id = p.user_id
  ) q;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION admin_list_community_reports(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_list_community_reports(text, boolean) TO anon, authenticated;

-- ============================================================
-- 8. RPC — admin: 신고 처리
-- ============================================================
-- p_action: keep(다시 공개) / warn(경고·글 삭제) / d7(7일 정지·글 삭제) / perm(영구 정지·글 삭제)
CREATE OR REPLACE FUNCTION admin_resolve_community_report(
  p_admin_token text,
  p_post_id     uuid,
  p_action      text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post   record;
  v_reason text;
BEGIN
  PERFORM _admin_assert(p_admin_token);

  IF p_action NOT IN ('keep', 'warn', 'd7', 'perm') THEN
    RETURN jsonb_build_object('ok', false, 'error', '알 수 없는 처리 방식');
  END IF;

  SELECT id, user_id, status INTO v_post FROM community_posts WHERE id = p_post_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', '글을 찾을 수 없어요');
  END IF;

  v_reason := _community_top_reason(p_post_id);
  PERFORM set_config('app.moderation', 'on', true);

  IF p_action = 'keep' THEN
    IF v_post.status = 'hidden' THEN
      UPDATE community_posts SET status = 'active', hidden_reason = NULL WHERE id = p_post_id;
    END IF;
  ELSE
    UPDATE community_posts
       SET status = 'removed', hidden_reason = coalesce(v_reason, hidden_reason)
     WHERE id = p_post_id;

    INSERT INTO community_user_status (user_id) VALUES (v_post.user_id)
    ON CONFLICT (user_id) DO NOTHING;

    UPDATE community_user_status
       SET strikes         = strikes + 1,
           suspended_until = CASE p_action
                               WHEN 'd7'   THEN greatest(coalesce(suspended_until, now()), now()) + interval '7 days'
                               WHEN 'perm' THEN 'infinity'::timestamptz
                               ELSE suspended_until
                             END,
           last_action     = p_action,
           last_reason     = v_reason,
           last_at         = now(),
           last_seen       = false
     WHERE user_id = v_post.user_id;
  END IF;

  UPDATE community_reports
     SET resolved_at = now(), resolution = p_action
   WHERE post_id = p_post_id AND resolved_at IS NULL;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION admin_resolve_community_report(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_resolve_community_report(text, uuid, text) TO anon, authenticated;

-- ============================================================
-- 적용 후 확인 (SQL Editor 에서 따로 실행)
-- ============================================================
-- 아래 결과가 4 이면 OK (테이블 2개 + 함수 2개 확인)
-- SELECT (SELECT count(*) FROM pg_tables WHERE tablename IN ('community_reports', 'community_user_status'))
--      + (SELECT count(*) FROM pg_proc WHERE proname IN ('community_report_post', 'admin_resolve_community_report'));
