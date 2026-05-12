# 다음 세션용 프롬프트 — CRM / Community 고도화 진단 + 계획

> 이 파일의 `--- PROMPT START ---` ~ `--- PROMPT END ---` 사이를 복사해
> 새 세션 첫 메시지로 붙여넣으세요.

---

--- PROMPT START ---

# 작업 — CRM 포털 + Community 고도화 진단 + 5단계 계획

이전 세션에서 베타 운영 단계 (Phase E) 진입 + 옵션 B 화이트리스트 + 인앱 브라우저 안내 + 주간 리포트 rate limit + 회원앱 빈 row 가드 + 카카오 OAuth 비활성화 + 베타 사용 가이드 PDF 까지 완료. 이번 세션의 단일 작업은 **CRM 포털과 Community 의 고도화 계획 수립** (코드 변경 미진행, 진단 + 계획만).

## 현재 프로젝트 상태 — 새 세션이 헷갈리지 말 것

| 영역 | 위치 | 배포 상태 | 비고 |
|---|---|---|---|
| **트레이너 앱** | `apps/portal/src/pages/TrainerApp.jsx` | ✅ **운영 배포** (ownapp.kr/trainer) | 옵션 B 화이트리스트 흐름 |
| **회원 앱** | `apps/portal/src/pages/MemberPortal.jsx` | ✅ **운영 배포** (ownapp.kr/member) | 트레이너 사전 등록 필수 |
| **CRM 포털** | `apps/crm` (port 3020, GymPortal, 11 탭) | ❌ **local only** | dev 단계 |
| **Community** | `apps/portal/src/pages/Community*` 또는 ComingSoon placeholder | ❌ **local only** | 운영에선 ComingSoon 표시 |
| **Admin** | `apps/admin` (port 3010) | ❌ local only (옵션 C — Hobby 제한) | |
| **공유 라이브러리** | `packages/shared/{lib,components}` | — | 모노레포 |
| **DB** | Supabase Free | ✅ 운영 + dev 같은 인스턴스 사용 | 마이그레이션 ~053 |

**핵심:** CRM 과 Community 는 코드는 있지만 **운영 배포 안 됨**. ownapp.kr 에서 /crm /community 라우트는 ComingSoon 컴포넌트로 차단된 상태.

## 사용자 제약사항 — 절대 무시 X

| 제약 | 의미 |
|---|---|
| **1인 개발자** | 거대한 리팩터 / 복잡한 인프라 제안 X. 유지보수 부담 최소. |
| **베타 인프라 비용 $0/월** | 추가 paid 서비스 도입 X. Supabase Free + Vercel Hobby + Cafe24 도메인만. |
| **법적 리스크 회피** | PIPA 준수, 외부 SNS 데이터 가져오기 등 검수 필요한 기능 우선순위 낮음. |
| **ship-first / fix-later** | 운영 데이터 보고 결정. 미리 P1 fix 하지 않음. (사용자 결정 스타일 메모리: `~/.claude/projects/.../memory/user_decision_style.md`) |
| **락인 없는 변경 선호** | 옵션 A ↔ B 전환 비용 명확히 산정해서 제시. |
| **ops 초보자** | Git / GitHub UI / Supabase Dashboard 같은 외부 절차는 step-by-step 안내. |

## 본 세션 산출물 — 5단계 보고서 (코드 변경 0)

### 1단계 — CRM + Community 기존 구현 기능 인벤토리

**Goal:** 각 앱의 모든 탭/기능을 빠짐없이 카탈로그화.

작업:
- `apps/crm/src/pages/GymPortal.jsx` (또는 메인 진입점) + 11개 탭 컴포넌트 스캔
- Community 관련 코드 (portal 안의 /community 라우트, community 관련 컴포넌트) 스캔
- 각 기능당: 이름 / 역할 / 핵심 DB 테이블·RPC / 의존 라이브러리

산출:
- CRM 탭 11개 + 그 안의 서브기능 표
- Community 기능 표
- 공유되는 데이터 모델 (gym, trainer, member, settlement, community_users 등)

**효율 권장:** Explore subagent 또는 직접 grep 으로 빠르게 인덱싱. 전체 파일 읽기 X (컨텍스트 폭발 주의).

### 2단계 — 오류·버그 가능성 점검 + 해결책 제시

**Goal:** 1단계 인벤토리 기반으로 운영 배포 시 깨질만한 곳 식별.

핵심 점검 영역:
1. **RLS strict 영향** — 050/051 마이그레이션 이후 CRM 측 직접 SELECT/INSERT 가 anon key 로 차단되는 곳 (admin RPC 052 같은 패턴 필요한 곳)
2. **빈 row 함정** — trainer/member 에서 fix 한 PostgREST composite NULL → 빈 객체 변환 함정. CRM/Community RPC 중에 동일 패턴 있는지
3. **AI 비용 폭탄** — Gemini 호출이 rate limit 없이 무한 가능한 흐름 (주간 리포트는 fix 됨)
4. **권한 / RBAC** — gym_owner / trainer / member / instructor 간 권한 누수 가능성
5. **데이터 일관성** — settlement, payments, attendance 등 cross-table 정합성
6. **민감 정보 누출** — community 게시글 / 1:1 메시지 / 결제 정보 RLS

각 항목에 P0 / P1 / P2 / P3 우선순위 매김. P0 = 운영 배포 차단, P1 = 출시 후 1주 내 수정, P2 = 정식 출시 전, P3 = nice-to-have.

산출:
- 발견된 위험 N개 표 (영역 / 위험도 / 해결 방향 / 작업량 / 락인 여부)
- **fix 자체는 진행 X** — 식별 + 권장 우선순위만

### 3단계 — 경쟁사 "브로제이" 와의 비교 브리핑

**Goal:** 차이점 (장단점) 명확히 정리해 고도화 방향의 근거 마련.

브로제이 = 한국 PT 트레이너용 CRM SaaS (https://broj.io 또는 검색해서 정확한 도메인 확인). 회원 관리·결제·일정·리포팅 기능 보유.

작업:
- WebSearch 또는 WebFetch 로 브로제이 공식 사이트 / 기능 소개 페이지 / 가격 정책 / 사용자 후기 조사
- 오운 CRM 의 현재 기능 (1단계 인벤토리) 과 매핑

산출 형식:
| 항목 | 브로제이 | 오운 CRM | 평가 |
|---|---|---|---|
| 회원 관리 | ... | ... | 동등 / 우위 / 열위 |
| 결제 / 정산 | ... | ... | |
| AI 기능 | ... | ... | |
| 가격 | ... | $0 (베타) | |
| ...10여 개 항목 |

장단점 요약:
- 오운의 우위 (AI 일지, 0원 비용, 자유 커스터마이징)
- 오운의 열위 (브랜드 인지도, 결제 PG 미연동, 검증된 안정성)
- 기회 (브로제이가 못 하는 영역에서 차별화)

### 4단계 — 고도화 방향 (1인 개발자 / 비용 0 / 법적 리스크 회피 전제)

**Goal:** 3개월 (베타) ~ 6개월 (정식 출시) 로드맵.

다음 카테고리별로 권장 방향:
- **즉시 안정화** (P0/P1 위주)
- **차별화 기능** (AI, 1인 강사 특화)
- **수익화 준비** (Toss/Stripe 결제 PG, 플랜 게이팅)
- **확장성** (사용자 100명+ 대응)
- **법적/규정 준수** (PIPA 정기 점검, 약관/개인정보 업데이트)

각 항목에 작업량 (시간/일/주) + 락인 여부 + 비용 영향 표시.

ship-first 원칙에 따라 **MVP** 와 **Phase 2** 와 **Phase 3** 로 단계화. Phase 1 만 즉시 진행, 나머지는 운영 데이터 기반 재평가.

### 5단계 — CRM / Community 배포 결정 트리

**Goal:** "운영 배포 vs local 유지" 결정 가이드.

옵션 트리:
- **옵션 A — 운영 배포 (별도 도메인)**: crm.ownapp.kr / community.ownapp.kr 같은 별도 서브도메인. Vercel 프로젝트 분리 (Hobby 무료 한도 내).
  - 장점: 사용자 즉시 접근
  - 단점: Vercel Hobby 의 commercial use 제한, 각 앱 사용자 풀 분리 부담
- **옵션 B — portal 통합 배포**: ownapp.kr/crm 같은 단일 도메인 내 라우트로. 현재 ComingSoon 해제만.
  - 장점: 도메인 1개, 인프라 단순
  - 단점: portal 번들 크기 증가, RLS 권한 모델 복잡
- **옵션 C — local 유지** (현재 상태):
  - 장점: 0 작업 / 0 비용
  - 단점: 베타 사용자 접근 불가
- **옵션 D — 정식 출시 단계에 별 도메인 + 별 repo 분리**: Path B 분리 계획 (`~/.claude/plans/elegant-imagining-rose.md`) 의 다음 단계.

각 옵션별 다음을 평가:
- 즉시 시작 가능성
- 사용자 부담 (수동 작업)
- 운영 인프라 비용
- 정식 출시 전환 비용 (락인 정도)
- 베타 30명 풀에서의 가치

**추천 1개 옵션** + 그 이유 + 즉시 작업 (있다면) 명시.

## 참고 자료 — 새 세션이 먼저 읽을 것

| 파일 | 역할 |
|---|---|
| `~/.claude/plans/elegant-imagining-rose.md` | 메인 프로젝트 plan — 전체 Phase 로드맵 |
| `docs/work-log-2026-05-10.md` | 베타 출시 완료 기록 (도메인+Vercel+OAuth) |
| `docs/work-log-2026-05-11.md` | 옵션 B 화이트리스트 + 회원앱 보안 fix |
| `docs/베타-사용가이드.md` | 트레이너/회원 기능 카탈로그 (단, 트레이너+회원만, CRM/Community 제외) |
| `~/.claude/projects/.../memory/MEMORY.md` | 사용자 결정 스타일 / 비용 제약 등 누적 메모 |
| `apps/crm/src/pages/` (디렉토리) | CRM 코드 |
| `supabase/migrations/` 053까지 | DB 스키마 + RPC |

## 운영 원칙 — 본 세션 종료까지 지킬 것

- **코드 변경 X** — 진단 + 계획만. 사용자 명시 동의 후 다음 세션에서 코드 작업.
- **WebSearch 활용** — 브로제이 정보는 외부 검색으로 최신 정보 확보. 추측 X.
- **Agent 활용** — 코드 인벤토리 / 경쟁사 조사 같은 폭 넓은 작업은 Explore / general-purpose subagent 로 위임해 컨텍스트 절약.
- **표 형식 위주** — 긴 prose 보다 비교 표 / 우선순위 표가 사용자 의사 결정에 도움.
- **각 단계 종료 시 짧은 요약** — 다음 단계 진입 전에 사용자 동의 받기 (auto mode 가 아니라면).
- **TodoWrite 사용** — 5단계 진행 상황 추적.
- **현재 worktree 확인** — `.env` 복사 필요할 수 있음. CLAUDE.md 의 worktree 절차 참고.

## 산출물 저장 위치

본 세션의 최종 산출물 = `docs/crm-community-roadmap-2026-05-13.md` (또는 해당 날짜)

각 단계 산출물을 이 한 파일에 누적해 저장. 5단계 완료 시 사용자에게 1-click PR 머지 안내 (코드 변경 0, docs 만 추가).

--- PROMPT END ---

---

## 사용 방법

1. 새 Claude Code 세션 시작
2. 위 `--- PROMPT START ---` ~ `--- PROMPT END ---` 사이 텍스트 통째로 복사
3. 새 세션 첫 메시지로 붙여넣기
4. Claude 가 5단계 진행 → 최종 `docs/crm-community-roadmap-2026-05-13.md` 생성
5. 결과 검토 후 다음 작업 세션에서 실제 fix / 고도화 진행

## 보강 옵션 (선택)

새 세션 시작 시 추가 컨텍스트 주고 싶으면 위 프롬프트 끝에 덧붙이세요:

```
[추가 컨텍스트]
- 이번 주 베타 가입자: N명
- 박성인 님 응대 결과: 정상 가입 완료 / 미진행
- 우선순위 1순위로 다루고 싶은 영역: (회원 관리 / 결제 / AI / 커뮤니티 모더레이션 등)
```
