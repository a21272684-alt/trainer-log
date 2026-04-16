# TrainerLog 업데이트 정리

> 기존 `TrainerLog_프로젝트_정리.md` 이후 변경·추가된 내용 전체 기록  
> 기준: 2026년 4월 (Vite + React 전환 이후)

---

## 1. 아키텍처 전환

### 기존 → 현재

| 항목 | 기존 | 현재 |
|---|---|---|
| 프레임워크 | HTML/CSS/JS 단일 파일 | **Vite + React 19 SPA** |
| 라우팅 | 없음 (HTML 파일 분리) | react-router-dom v6 |
| 스타일 | 인라인 CSS | CSS 모듈 + 인라인 style (다크 테마 CSS 변수) |
| 빌드 | 없음 | `npx vite build` → `/dist` |
| 배포 | Vercel (HTML) | Vercel (Vite SPA) |

### 페이지 구조 (라우터)

```
/           → 메인 랜딩
/trainer    → TrainerApp.jsx     — 트레이너 앱
/member     → MemberPortal.jsx   — 회원 포털
/community  → CommunityPortal.jsx — 커뮤니티 포털
/report     → 공개 리포트 (비인증)
```

---

## 2. 기술 스택 변경

| 항목 | 추가/변경 |
|---|---|
| AI 모델 | Gemini 1.5 Flash → **gemini-2.5-flash-lite** |
| AI 호출 | 분산 fetch → `src/lib/ai_templates.js` 통합 관리 |
| 인증 | 없음 → **Google OAuth** (community), 이름+전화 (trainer/member) |
| 스토리지 | 없음 → Supabase Storage (`community-profiles` 버킷) |
| Web Push | 없음 → Supabase + VAPID 키 기반 푸시 알림 |

---

## 3. DB 마이그레이션 현황 (001 ~ 024)

| 번호 | 파일 | 주요 내용 |
|---|---|---|
| 001 | `001_init.sql` | trainers, members, logs, health_records 초기 스키마 |
| 002 | `002_lesson_purpose_subscriptions.sql` | 레슨목적, 구독 테이블 |
| 003 | `003_health_weight_profile.sql` | 체중·건강 프로필 컬럼 |
| 004 | `004_report_exercises.sql` | 리포트, 운동 기록 |
| 005 | `005_kakao_phone_session_price.sql` | 카카오 전화, 세션 단가 |
| 006 | `006_attendance_products_payments.sql` | 출석, 상품, 결제 테이블 |
| 007 | `007_web_push.sql` | Web Push 구독 테이블 |
| 008 | `008_member_fields.sql` | 회원 추가 필드 |
| 009 | `009_member_holds.sql` | 회원권 정지(홀딩) |
| 010 | `010_hold_photos_bucket.sql` | 홀딩 첨부사진 스토리지 |
| 011 | `011_fix_holds_rls.sql` | 홀딩 RLS 수정 |
| 012 | `012_workout_logs.sql` | workout_sessions, workout_routines 테이블 |
| 013 | `013_community.sql` | community_posts, community_users, community_contacts |
| 014 | `014_workout_source.sql` | workout_sessions.source 컬럼 |
| 015 | `015_member_community.sql` | 회원-커뮤니티 연결 |
| 016 | `016_gym_structure.sql` | gyms, gym_owners, gym_trainers 테이블 |
| 017 | `017_global_exercises.sql` | global_exercises 테이블 + 시드 데이터 (60+ 종목) |
| 018 | `018_gym_fk.sql` | 헬스장 FK 연결 |
| 019 | `019_settlement_engine.sql` | 정산 엔진 |
| 020 | `020_settlement_snapshots.sql` | 정산 스냅샷 |
| **021** | `021_churn_risk.sql` | **이탈 위험 스코어링 시스템** |
| **022** | `022_weekly_report.sql` | **센터 주간 운영 리포트 자동 생성** |
| **023** | `023_educator_market.sql` | **교육자 마켓 (구매, 전문 콘텐츠)** |
| **024** | `024_routine_templates.sql` | **루틴 템플릿 마켓** |

---

## 4. 신규 기능 상세

---

### 4-1. 이탈 위험 스코어링 (Churn Risk)

**파일:** `supabase/migrations/021_churn_risk.sql`, `src/lib/churnRisk.js`

**점수 산출 공식 (0~100점)**

| 축 | 만점 | 기준 |
|---|---|---|
| 출석 | 40점 | 최근 2주 vs 이전 2주 출석률 변화 |
| 건강 기록 | 30점 | 최근 2주 체중 기록 중단 여부 |
| 수업 평점 | 30점 | logs.session_rating(1~5) 저하 여부 |

**위험 등급**

| 등급 | 점수 | 색상 |
|---|---|---|
| 🟢 안전 | 0~29 | `#22c55e` |
| 🟡 관찰 | 30~49 | `#eab308` |
| 🟠 위험 | 50~74 | `#f97316` |
| 🔴 이탈 임박 | 75~100 | `#ef4444` |

**DB 구성**
- `member_risk_scores` 테이블: member_id unique, risk_score, risk_level, 3개 축 점수
- `compute_member_risk(p_member_id)` RPC: 스코어 계산 + upsert
- `get_trainer_risk_scores(p_trainer_id)` RPC: 트레이너 전체 회원 위험도 일괄 조회
- `v_churn_risk_dashboard` 뷰

**TrainerApp UI**
- 회원 카드에 위험도 뱃지 표시 (`🟠 72`)
- 회원 필터: '이탈위험' 탭 (risk + critical 필터)
- 회원 정렬: '위험도순'
- `RiskPanel` 컴포넌트: 3개 축 점수 바, 이탈 플래그, 개입 행동 제안
- 수업 평점 입력 UI (1~5점)

---

### 4-2. 센터 주간 운영 리포트 (Weekly Report)

**파일:** `supabase/migrations/022_weekly_report.sql`, `src/lib/gymReport.js`

**DB 구성**
- `gym_weekly_reports` 테이블: gym_id, week_start, status, report_text, stats_snapshot
- `get_gym_weekly_stats(p_gym_id, p_week_start)` RPC: 출석/회원/세션/수익/트레이너별/이탈위험/만료예정 통계
- `create_pending_weekly_report`, `save_weekly_report`, `fail_weekly_report` RPC
- `v_pending_reports` 뷰
- pg_cron `'0 0 * * 1'` (Pro 플랜용, 현재 주석 처리)

**클라이언트 로직**
- `generateWeeklyReport()`: pending → 통계 수집 → Gemini 생성 → 저장 파이프라인
- `checkAndEnsurePendingReport()`: 매주 월요일 자동 감지 (Free 플랜 대응)
- `parseReportSections()`: 📊✅⚠️💡💬 섹션 파싱 → 스타일드 렌더

**AI 모델:** `gemini-2.5-flash-lite`

---

### 4-3. AI 프롬프트 템플릿 통합 (`ai_templates.js`)

**파일:** `src/lib/ai_templates.js`

모든 Gemini 호출과 프롬프트 빌더를 하나의 파일에 집중 관리.

| 함수 | 설명 |
|---|---|
| `callGemini(apiKey, model, prompt, opts)` | 텍스트 전용 Gemini 호출 |
| `callGeminiMultipart(apiKey, model, parts, opts)` | 오디오+텍스트 멀티파트 호출 |
| `buildSessionLogPrompt(...)` | 수업일지 자동 생성 |
| `buildMemberInsightPrompt(member, stats)` | 회원 이탈·성과 AI 분석 |
| `buildGymWeeklyReportPrompt(stats)` | 센터 주간 운영 리포트 |
| `buildChurnInterventionPrompt(member, riskResult)` | 이탈 위험 회원 개입 메시지 |
| `buildRenewalPrompt(member, stats)` | 만료 회원 재등록 유도 메시지 |
| `buildRoutineAnalysisPrompt(...)` | 루틴 밸런스·볼륨 AI 분석 |

**하위 호환:** `memberInsights.js`, `gymReport.js` 에서 re-export 유지

---

### 4-4. 교육자 마켓 (Educator Market)

**파일:** `supabase/migrations/023_educator_market.sql`, `src/lib/permissions.js`

기존 `community_posts`를 활용한 유·무료 콘텐츠 마켓.

**DB 추가 컬럼 (community_posts)**

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `price` | integer | 0 = 무료 |
| `market_type` | text | `routine\|program\|nutrition\|content` |
| `purchase_count` | integer | 트리거 자동 갱신 |

**신규 테이블**

| 테이블 | 설명 |
|---|---|
| `market_purchases` | 구매 이력 (unique: post_id + buyer_id), amount_paid 박제 |
| `market_item_contents` | 구매 후 공개 전문 콘텐츠 (full_content, routine_data JSONB, file_url) |

**RPC**

| 함수 | 설명 |
|---|---|
| `purchase_market_item(post_id, buyer_id)` | 구매 처리 (중복/자기구매 방지) |
| `check_market_purchase(post_id, buyer_id)` | 구매 여부 확인 |
| `get_seller_stats(seller_id)` | 총판매/수익/최근 구매자 10명 |

**권한 (permissions.js)**

```js
educator_market: {
  view:  ['trainer', 'member', 'educator', 'instructor', 'gym_owner'],
  write: ['educator', 'instructor'],
  isMarket: true,
}
```

**CommunityPortal 화면**

| screen | 내용 |
|---|---|
| `market` | 마켓 목록 (타입 필터 탭: 전체/루틴/프로그램/식단/콘텐츠) |
| `market_detail` | 상품 상세 (미리보기 + 구매 버튼 + 전문 콘텐츠 잠금/열람) |
| `market_write` | 상품 등록 (유형 선택 → 가격 → 미리보기 → 전문 콘텐츠) |

**마이페이지 추가 탭**
- `내 구매`: 구매한 상품 목록 → 클릭 시 상세로 이동
- `판매 현황`: educator/instructor 전용 — 총상품/판매/수익 요약, 최근 구매자

---

### 4-5. 루틴 템플릿 마켓 (Routine Template Market)

**파일:** `supabase/migrations/024_routine_templates.sql`, `src/lib/routineTemplates.js`  
**컴포넌트:** `src/components/community/RoutineTemplateBuilder.jsx`, `RoutineTemplateViewer.jsx`, `ApplyRoutineModal.jsx`

교육자가 주차별 구조화된 운동 프로그램을 제작·판매하고, 트레이너가 구매 후 회원에게 즉시 적용하는 기능.

**weeks_data JSONB 스키마**

```jsonc
[{
  "week": 1,
  "label": "1주차 · 기초 적응기",
  "days": [{
    "day": 1,
    "label": "월요일 · Push",
    "focus": "가슴·어깨·삼두",
    "estimated_min": 60,
    "exercises": [{
      "name": "벤치프레스",
      "order": 1,
      "sets": [{ "set":1, "reps":"8-10", "weight_note":"1RM 70%", "rest_sec":90, "rir":3 }],
      "notes": "바를 가슴 하단에 터치"
    }]
  }]
}]
```

**DB 구성**

| 테이블/함수 | 설명 |
|---|---|
| `routine_templates` | post_id 1:1, goal/level/duration_weeks, weeks_data JSONB, preview_day JSONB, apply_count |
| `routine_template_applications` | 트레이너→회원 적용 이력, routine_id(workout_routines) 연결 |
| `create_routine_template` RPC | educator_market/routine 검증 후 insert |
| `get_routine_template` RPC | 구매자/판매자/무료 → weeks_data 전체, 미구매 → preview_day만 |
| `apply_routine_to_member` RPC | 특정 주차를 workout_routines 포맷으로 변환 후 insert |
| `get_educator_routine_stats` RPC | 총 템플릿/판매/적용/수익 + Top 5 루틴 |
| `v_routine_market` 뷰 | educator_market 중 market_type=routine만 조회 |

**목표/레벨 상수**

| 목표 key | 설명 |
|---|---|
| `strength` | 근력 향상 |
| `hypertrophy` | 근비대 |
| `fat_loss` | 다이어트 |
| `endurance` | 체력·지구력 |
| `rehab` | 재활·교정 |

| 레벨 key | 설명 |
|---|---|
| `beginner` | 초급 (0~6개월) |
| `intermediate` | 중급 (6개월~2년) |
| `advanced` | 고급 (2년+) |

**컴포넌트 역할**

| 컴포넌트 | 역할 |
|---|---|
| `RoutineTemplateBuilder` | 교육자 제작 UI — 주차 탭, 요일 카드, 종목 자동완성(global_exercises), 세트 테이블 |
| `RoutineTemplateViewer` | 구매 후 열람 — 주차별 뷰어, 잠금/열람 분기, 트레이너 "적용" 버튼 |
| `ApplyRoutineModal` | 회원 선택 → 주차 선택 → workout_routines 자동 생성 → 완료 화면 |

**루틴 구매 → 트레이너 앱 즉시 동기화**

```
트레이너가 마켓에서 루틴 구매
    ↓
market_purchases 기록
    ↓
weeks_data[0].days[0].exercises → workout_routines 포맷 변환
    ↓
workout_routines INSERT (trainer_id=본인, member_id=NULL, name='[마켓] {제목}')
    ↓
트레이너 앱 "루틴 보관함" 즉시 반영
```

**트레이너 앱 루틴 보관함 (`member_id IS NULL`)**
- 로그인 시 자동 로드
- "📋 루틴 불러오기 · 🛒N" 버튼 (N = 보관함 루틴 수)
- 보관함 루틴 → "✅ {회원}에게 적용": `workout_routines` 복사본 생성 (member_id 지정)
- 보관함 루틴 → "폼에 불러오기": 운동 기록 입력 폼에 즉시 로드

**AI 루틴 분석**
- 구매자/판매자가 상세 화면에서 "🤖 AI 루틴 밸런스 분석" 버튼 클릭
- `buildRoutineAnalysisPrompt()`: 근육별 주당 세트 집계 → Gemini 분석
- 출력 섹션: ✅ 강점 / ⚖️ 밸런스 / ⚠️ 개선 포인트 / 💡 개선 제안 / 📊 종합 평가

---

### 4-6. 커뮤니티 포털 RBAC

**파일:** `src/lib/permissions.js`

역할별 포털 접근 및 카테고리별 view/write 권한을 중앙 관리.

**역할 정의**

| 역할 | 인증 방식 | 설명 |
|---|---|---|
| `trainer` | 이름+전화 | 퍼스널 트레이너 |
| `member` | 이름+전화 | 피트니스 회원 |
| `gym_owner` | Google OAuth | 헬스장 대표 |
| `educator` | Google OAuth | 교육강사 |
| `instructor` | Google OAuth | educator 별칭 (하위 호환) |

**카테고리별 권한 요약**

| 카테고리 | write 가능 역할 |
|---|---|
| 직원 구인 (`trainer_seeks_member`) | `gym_owner`, `trainer` |
| 트레이너 찾기 (`member_seeks_trainer`) | `member` |
| 수강생 구인 (`instructor_seeks_student`) | `instructor` ← **educator 제외** |
| 트레이너 채용 (`gym_seeks_trainer`) | `gym_owner` |
| 센터 구직 (`trainer_seeks_gym`) | `trainer` |
| 센터 제휴 (`gym_partnership`) | `gym_owner` |
| 교육 과정 홍보 (`educator_course`) | `educator`, `instructor` |
| 교육자 마켓 (`educator_market`) | `educator`, `instructor` |

> `createPost()` 진입 시 `COMMUNITY_ACCESS[writeCat].write.includes(user.role)` 재검증 — UI 우회 방어

---

## 5. 파일 구조 (현재)

```
src/
├── lib/
│   ├── supabase.js            — Supabase 클라이언트 + GEMINI_MODEL 상수
│   ├── permissions.js         — RBAC 중앙 관리 (역할, 카테고리, 헬퍼)
│   ├── ai_templates.js        — Gemini 호출 + 모든 프롬프트 템플릿
│   ├── churnRisk.js           — 이탈 위험 스코어 계산 + RPC 헬퍼
│   ├── gymReport.js           — 주간 리포트 생성 파이프라인
│   ├── memberInsights.js      — 회원 통계 계산 (ai_templates re-export)
│   ├── routineTemplates.js    — 루틴 템플릿 CRUD + 포맷 유틸
│   ├── exercises.js           — 운동 종목 로컬 DB (global_exercises로 이전 예정)
│   └── push.js                — Web Push 구독/알림
│
├── pages/
│   ├── TrainerApp.jsx         — 트레이너 앱 (회원관리, 수업일지, 운동기록)
│   ├── CommunityPortal.jsx    — 커뮤니티 포털 (피드, 마켓, 루틴 마켓)
│   └── MemberPortal.jsx       — 회원 포털
│
├── components/
│   ├── common/
│   │   ├── Modal.jsx
│   │   └── Toast.jsx
│   └── community/
│       ├── RoutineTemplateBuilder.jsx  — 루틴 제작 빌더
│       ├── RoutineTemplateViewer.jsx   — 루틴 열람 뷰어
│       └── ApplyRoutineModal.jsx       — 회원 적용 모달
│
└── styles/
    ├── trainer.css
    └── community.css

supabase/migrations/
    001_init.sql ~ 024_routine_templates.sql
```

---

## 6. 현재 결제 방식

마켓 상품 결제는 **명예 과금(Honor System)** 방식으로 운영.
- DB에 구매 이력만 기록, 실제 결제는 구매자·판매자 간 직접 협의
- `market_purchases.amount_paid` 컬럼에 구매 당시 가격 박제
- 추후 Toss Payments / 카카오페이 연동 시 `payment_id` 컬럼 추가 예정

---

## 7. 환경 변수 / 설정

| 항목 | 위치 | 설명 |
|---|---|---|
| Supabase URL/Key | `src/lib/supabase.js` | 하드코딩 (환경변수 전환 권장) |
| Gemini API Key | `localStorage('gemini_api_key')` | 트레이너가 설정 화면에서 입력 |
| GEMINI_MODEL | `src/lib/supabase.js` | `'gemini-2.5-flash-lite'` |
| Supabase PAT | 배포 환경 외부 | `sbp_9b507867...` (마이그레이션 실행용) |
| Supabase Project Ref | — | `udnyilxwskgkofbvvzfy` |

---

## 8. 잔여 TODO

- [ ] `017_global_exercises.sql`, `018_gym_fk.sql` 라이브 DB 실행 확인
- [ ] 결제 게이트웨이 연동 (Toss Payments or 카카오페이)
- [ ] pg_cron 주간 리포트 자동 실행 (Supabase Pro 플랜 필요)
- [ ] `workout_routines` 다중 주차 전체 적용 (현재 1주차 단일 적용)
- [ ] 마켓 상품 수정 기능 (현재 등록/삭제만 지원)
- [ ] 커뮤니티 알림 (새 연락 요청 Web Push)

---

*마지막 업데이트: 2026년 4월*
