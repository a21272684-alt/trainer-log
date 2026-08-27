-- 074_app_settings_protect_gemini_key.sql
-- 🔒 app_settings 의 gemini_api_key 가 anon(publishable) 에 노출되던 것 차단.
--
-- 문제:
--   app_settings_select_public 정책이 USING(true) 라 anon 이 모든 key 조회 가능 →
--   gemini_api_key 값을 누구나 읽어 Gemini 쿼터 도용 가능.
--
-- 수정:
--   anon 은 gemini_api_key 를 제외한 나머지(랜딩 설정 등)만 읽고,
--   로그인 사용자(authenticated, auth.uid() 존재)는 gemini_api_key 도 읽음.
--   → 회원앱/트레이너앱(로그인 후 AI 사용)은 정상, 랜딩(anon)도 정상.
--
-- ※ 근본적으로는 AI 호출을 엣지 함수로 프록시해 키를 서버에만 두는 게 이상적(후속 과제).
--   본 마이그는 "전체 공개 → 로그인 한정" 으로 노출 범위를 크게 축소.

DROP POLICY IF EXISTS app_settings_select_public ON app_settings;

CREATE POLICY app_settings_select_public ON app_settings
  FOR SELECT TO public
  USING (
    key <> 'gemini_api_key'      -- 공개 설정 키는 anon 도 읽기
    OR auth.uid() IS NOT NULL    -- gemini_api_key 는 로그인 사용자만
  );
