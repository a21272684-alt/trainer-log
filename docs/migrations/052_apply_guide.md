# 052_admin_rpcs 적용 가이드

## 개요

`supabase/migrations/052_admin_rpcs.sql` 은 RLS strict (050/051) 적용 후 깨진 admin 화면을 SECURITY DEFINER RPC 로 복원하는 마이그레이션입니다. 사용자가 직접 정해야 할 토큰값 1개와, SQL Editor 에 붙여넣기 + .env 갱신 두 단계가 필요합니다.

## 사전 결정 — admin 토큰값 정하기

토큰은 **AdminPortal 빌드 산출물에 그대로 박히는** 비밀이라, 너무 짧거나 추측 가능한 값은 위험합니다. 권장:

```
# PowerShell 에서 32자 랜덤 문자열 생성
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object { [char]$_ })
```

또는 외부 도구 (uuidgen, 1Password 의 random password 생성기 등) 사용. 결정한 값을 `<my-token>` 로 부르겠습니다.

## 단계 1 — SQL Editor 적용

1. `supabase/migrations/052_admin_rpcs.sql` 열기.
2. 본문에서 `<<ADMIN_TOKEN>>` 두 군데 모두 `<my-token>` 으로 치환 (검색·바꾸기). 코미트 하지는 말고 임시 사본만 만들면 됩니다.
3. Supabase Dashboard → SQL Editor → New query → 치환된 SQL 전체 붙여넣기 → Run.
4. 정상이면 NOTICE 만 출력되고 에러 없음.

### 검증 쿼리 (SQL Editor 에서 실행)

```sql
-- 1) 토큰 가드 동작
SELECT admin_list_trainers('wrong');         -- ERROR: admin: unauthorized 기대
SELECT * FROM admin_list_trainers('<my-token>') LIMIT 1;  -- 1행 반환 기대

-- 2) 모든 admin RPC 가 SECURITY DEFINER 인지
SELECT proname, prosecdef
  FROM pg_proc
 WHERE proname IN (
   '_admin_assert',
   'admin_list_trainers','admin_list_members','admin_list_logs','admin_list_payments',
   'admin_update_trainer_crm_permissions','admin_register_trainer',
   'admin_add_credits','admin_set_trainer_plan',
   'app_settings_admin_upsert','app_settings_admin_delete'
 );
-- prosecdef 모두 true 여야 함.

-- 3) app_settings RLS
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'app_settings';
-- app_settings_select_public(SELECT) + app_settings_write_service_role_only(ALL)
```

## 단계 2 — Admin 앱 .env 주입

`apps/admin/.env.local` (없으면 생성) 에 다음 한 줄 추가:

```
VITE_ADMIN_DB_TOKEN=<my-token>
```

⚠️ `.env.local` 은 `.gitignore` 대상이라 커밋되지 않습니다. 각 개발 머신·배포 환경별로 동일한 값 주입.

빌드 시점에 Vite 가 정적 치환하므로 dev server 또는 빌드를 재시작해야 적용됩니다.

## 단계 3 — Admin 앱 동작 확인

```
npm run dev:admin   # http://localhost:3010
```

ID/PW 로그인 후:

- **트레이너 목록** 탭: 행 표시 ✓ / `+ 트레이너 등록` 모달에서 신규 등록 ✓ / 크레딧 충전 ✓
- **회원 현황** 탭: 행 표시 ✓
- **수업일지** 탭: 최근 100건 표시 ✓ / 기간 필터 (오늘/주/월) 동작 ✓
- **CRM 권한** 탭: 토글 클릭 → 새로고침해도 유지 ✓
- **앱 설정 / 랜딩 / 플랜 / 약관 / API 키**: 저장 + 삭제 ✓
- **공지사항 / 커뮤니티 / 마켓**: 회귀 없음 (lax RLS 그대로) ✓

빌드 검증:

```
npm run build:admin
```

## 토큰 회전 절차 (향후)

토큰 노출 의심 시:

1. 새 토큰 `<new-token>` 생성.
2. `supabase/migrations/053_admin_token_rotate.sql` 작성:
   ```sql
   CREATE OR REPLACE FUNCTION _admin_assert(p_admin_token text)
   RETURNS void
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = public
   AS $$
   BEGIN
     IF p_admin_token IS NULL OR p_admin_token <> '<new-token>' THEN
       RAISE EXCEPTION 'admin: unauthorized' USING ERRCODE = '42501';
     END IF;
   END;
   $$;
   ```
3. SQL Editor 에 붙여넣기 → Run.
4. 모든 배포 환경의 `VITE_ADMIN_DB_TOKEN` 값을 동시에 `<new-token>` 으로 교체 + admin 빌드 재배포.

## 위험 / 한계

- **토큰 노출:** Vite 빌드 산출물에 그대로 박힘 → admin 화면을 인터넷 공개하면 누구나 devtools 로 추출 가능. 단기 완화: admin 도메인을 사내망/특정 IP 제한 호스팅. 중장기 (Phase E 이후): Edge Function + httpOnly cookie 기반 admin 세션.
- **롤백:** 052 의 모든 RPC 가 `DROP FUNCTION IF EXISTS ... CASCADE` 가능. 단 028/029 시그니처가 변경되었으므로 클라이언트와 동시 롤백 필요. 053_revert.sql 을 미리 준비 추천.
- **fix_rls_top3.sql:** worktree 루트의 초안 SQL. 본 052 가 ① 섹션을 idempotent 하게 흡수하므로 별도 적용 불필요. ② market_item_contents / ③ Storage 6개 버킷 정책은 본 작업 범위 밖 — 별도 PR 에서 진행.
