# trainer-log — Claude Code 작업 가이드

## 프로젝트 개요
React 19 + Vite 6 **npm workspaces 모노레포**. 3개 앱(`apps/portal`, `apps/crm`, `apps/admin`) + 1개 공유 패키지(`packages/shared`). Supabase 단일 인스턴스. 각 앱이 자체 vite + 자체 의존성 + 다른 포트로 동작. 향후 진짜 별도 git repo 로 분리할 때 각 `apps/<name>/` 폴더를 그대로 잘라 옮기면 됨.

분리 진행 계획: `~/.claude/plans/elegant-imagining-rose.md`.

## ⚠️ Worktree 작업 시 필수 절차 — `.env` 복사

**git worktree 는 `.gitignore` 된 파일을 자동 복사하지 않습니다**. 새 worktree (`.claude/worktrees/<name>/`) 에서 dev/build 를 돌리기 전에 main repo 의 다음 파일들을 worktree 로 복사해야 합니다.

### 복사 대상
| 파일 | 필수성 | 누락 시 증상 |
|---|---|---|
| `.env` | **필수** | `[supabase] 환경변수가 설정되지 않았습니다` throw → 모든 페이지 unmount |
| `.env.local` | 있다면 필수 | dev 전용 override 손실 |
| `.env.production`, `.env.*.local` | 있을 수만 있음 | prod 빌드 시 영향 |

### 자동화 — SessionStart hook
`.claude/settings.local.json` 의 SessionStart hook 이 세션 시작 시 자동으로:
1. cwd 가 `*\.claude\worktrees\*` 패턴 매치인지 확인
2. main repo 경로 = `Get-Item $PWD.Path` 의 Parent **3번** (hungry-buck-3d69aa → worktrees → .claude → trainer-log)
3. main 의 `.env*` (`.env.example` 제외) 중 worktree 에 없는 파일만 `Copy-Item` (idempotent)

⚠️ **한계**: `.claude/settings.local.json` 은 worktree-local 이라 **이 worktree 에서만 hook 이 적용됨**. 새 worktree 를 처음 만들 땐 그 worktree 에 `.claude/` 자체가 없어 hook 도 없음 (닭-달걀). 두 옵션:

- **옵션 A — 새 worktree 마다 수동 복사 한 번**: `Copy-Item ..\..\..\..\.env -Destination .` 한 번만 실행하면 그 후로 이 hook 이 (settings 도 같이 복사된 경우) 작동.
- **옵션 B — user-global 등록 (권장)**: `~/.claude/settings.json` 에 동일한 hook 을 등록하면 모든 worktree (모든 프로젝트) 에 자동 적용. 명령 안의 cwd 검사가 trainer-log worktree 외엔 no-op 이라 안전.

옵션 B 등록 명령 (필요 시 사용자가 직접 실행):
```powershell
notepad $env:USERPROFILE\.claude\settings.json
# hooks.SessionStart 섹션을 .claude/settings.local.json 의 동일 부분으로 덮어쓰기
```

수동 강제 실행 (worktree 안에서):
```powershell
Copy-Item ..\..\..\..\.env -Destination . -ErrorAction SilentlyContinue
```

### 환경변수 목록
`.env.example` 참고. 필수 2개 (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), 선택 4개 (Web Push, Admin 자격, RPC 토큰).

### `.env` 변경 후 dev server 재시작
Vite 6 는 보통 `.env` 변경을 감지해 자동 재시작하지만, **worktree 새로 생성 직후엔 dev server 가 이미 throw 된 상태**라 자동 reload 가 동작하지 않습니다. 수동으로 dev server 멈췄다가 `npm run dev` 다시 실행.

## 디렉토리 구조

```
trainer-log/
├── apps/
│   ├── portal/  (port 3030, Landing/Trainer/Member/Community/정책 페이지)
│   ├── crm/     (port 3020, GymPortal + 11개 탭 — 헬스장 대표/직원)
│   └── admin/   (port 3010, AdminPortal — 시스템 관리자)
├── packages/
│   └── shared/  (lib 6개 + components/common 3개 + global.css)
├── supabase/    (migrations + functions, 4번째 repo 후보)
├── scripts/
└── package.json (workspaces root)
```

## 빌드/실행
**개발 (각 앱 별도 dev server, 다른 포트):**
- `npm run dev:portal` — http://localhost:3030
- `npm run dev:crm` — http://localhost:3020
- `npm run dev:admin` — http://localhost:3010
- 3개 동시에 띄워서 각자 별도 앱처럼 검증 가능

**빌드:**
- `npm run build` — 3개 앱 전부 (`build:all` 동등, 각자 `apps/<name>/dist/`)
- `npm run build:portal` / `build:crm` / `build:admin` — 단독

**환경변수:** 루트 `.env` 한 파일을 3개 앱이 공유 (각 vite.config 의 `envDir: '../..'` 설정). 별도 repo 로 분리 시 envDir 빼고 자체 `.env` 만 두면 됨.

## 공유 코드 (packages/shared)
import 경로는 패키지 이름 사용:
```js
import { supabase } from '@trainer-log/shared/lib/supabase'
import Modal from '@trainer-log/shared/components/common/Modal'
import '@trainer-log/shared/styles/global.css'
```

shared 항목:
- `lib/{supabase, permissions, churnRisk, memberInsights, gymReport, ai_templates}.js`
- `components/common/{Modal, Toast, TermsAgreementModal}.jsx`
- `styles/global.css`

## 앱별 라우트 매핑
**portal (3030):** `/`, `/trainer`, `/member`, `/community`, `/report`, `/terms`, `/privacy`, `/refund`. `/crm` 과 `/gym` 은 `CrmRedirect` 컴포넌트로 dev 시 localhost:3020, prod 시 crm.example.com 으로 이동.

**crm (3020):** 단일 라우트 `/` → GymPortal (OAuth 로그인) → GymOwnerPortal (11 탭).

**admin (3010):** 단일 컴포넌트 AdminPortal (라우터 없음, ID/PW 로그인).

## 분리 작업 진행 상태
- [x] Step 1: 공유 lib 중복 제거 (churnRisk/memberInsights/gymReport/ai_templates) + Modal/Toast rename
- [x] Step 2: `/gym` → `/crm` 리네임 + 호환 redirect
- [x] Step 3: `pages/admin/` → `pages/crm/` 폴더 rename
- [x] **Path B**: 모노레포 분리 — `apps/portal`, `apps/crm`, `apps/admin` + `packages/shared`. 각자 자체 vite + 자체 의존성 + 자체 dev port
- [ ] (선택) `trainer-log-infra` repo 추출 (`supabase/migrations`, `supabase/functions`) — **외부 작업**
- [ ] (선택) 각 `apps/<name>/` 폴더를 별도 git repo 로 잘라내기 — **외부 작업**. envDir 만 빼면 그대로 동작

## 코드 컨벤션
- JSX, JS only (TypeScript 미사용)
- Supabase RPC 우선 (특히 admin/CRM 의 정산·리포트 계산은 SECURITY DEFINER RPC 경유)
- 인라인 스타일 + CSS 클래스 혼재 (admin/CRM 영역은 인라인 위주, portal 영역은 클래스 위주)
- `useToast` hook 으로 알림. CRM 영역은 `CrmToast` (별개 구현, Step 1d 후 분리)
