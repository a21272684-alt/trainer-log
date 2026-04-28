# TrainerLog — 전체 프로젝트 정리

> 최종 업데이트: 2026-04-15  
> 버전: v2.0  
> 브랜치: `main` (워크트리: `claude/youthful-colden`)

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [기술 스택](#2-기술-스택)
3. [디렉토리 구조](#3-디렉토리-구조)
4. [인증 방식](#4-인증-방식)
5. [데이터베이스 전체 스키마](#5-데이터베이스-전체-스키마)
6. [포털별 기능 상세](#6-포털별-기능-상세)
7. [랜딩페이지](#7-랜딩페이지)
8. [주요 컴포넌트 & 라이브러리](#8-주요-컴포넌트--라이브러리)
9. [마이그레이션 전체 목록](#9-마이그레이션-전체-목록)
10. [커밋 이력 전체](#10-커밋-이력-전체)
11. [알려진 이슈 & 주의사항](#11-알려진-이슈--주의사항)

---

## 1. 프로젝트 개요

**TrainerLog**는 개인 트레이너와 회원을 연결하는 스마트 피트니스 관리 플랫폼입니다.

| 구분 | 내용 |
|------|------|
| 서비스 유형 | PWA (Progressive Web App) SPA |
| 주요 사용자 | 개인 트레이너, 피트니스 회원 |
| 핵심 가치 | AI 수업일지 자동화 + 회원 건강 추적 + 매출 분석 |

### 포털 구성

| 포털 | URL | 대상 |
|------|-----|------|
| 메인 랜딩 | `/` | 전체 |
| 트레이너 앱 | `/trainer` | 트레이너 |
| 회원 포털 | `/member` | 회원 |
| 커뮤니티 | `/community` | 트레이너·회원·강사·센터대표 |
| 관리자 | `/admin` | 시스템 관리자 |
| 리포트 | `/report` | 공개 수업일지 공유 |

---

## 2. 기술 스택

| 분류 | 기술 | 버전 |
|------|------|------|
| 프레임워크 | React | 19.1.0 |
| 번들러 | Vite | 6.3.0 |
| 라우팅 | React Router DOM | 7.5.0 |
| 백엔드/DB | Supabase (PostgreSQL) | 2.49.0 |
| 차트 | Chart.js | 4.4.0 |
| PDF 생성 | jsPDF | 2.5.1 |
| AI | Google Gemini API (`gemini-3.1-flash-lite-preview`) | — |
| 푸시 알림 | Web Push (VAPID) + Service Worker | — |
| 스타일 | CSS Modules (포털별 개별 CSS 파일) + 인라인 스타일 | — |
| 배포 | Vite Build → 정적 호스팅 | — |

---

## 3. 디렉토리 구조

```
trainer-log/
├── public/
│   └── sw.js                    # Service Worker (Web Push 백그라운드 알림)
├── src/
│   ├── App.jsx                  # 라우터 설정
│   ├── main.jsx                 # 앱 진입점
│   ├── components/
│   │   └── common/
│   │       ├── Modal.jsx        # 공통 모달 컴포넌트
│   │       └── Toast.jsx        # 토스트 알림 컴포넌트
│   ├── lib/
│   │   ├── supabase.js          # Supabase 클라이언트 + GEMINI_MODEL
│   │   ├── push.js              # Web Push 구독/스케줄 관리
│   │   └── exercises.js         # 60+ 운동 종목 DB (EXERCISE_DB)
│   ├── pages/
│   │   ├── Landing.jsx          # 메인 랜딩페이지
│   │   ├── TrainerApp.jsx       # 트레이너 앱 (최대 파일)
│   │   ├── MemberPortal.jsx     # 회원 포털
│   │   ├── CommunityPortal.jsx  # 커뮤니티 포털
│   │   ├── AdminPortal.jsx      # 관리자 포털
│   │   └── Report.jsx           # 공개 리포트 뷰어
│   └── styles/
│       ├── global.css           # 전역 스타일
│       ├── trainer.css          # 트레이너 앱 스타일 (다크 테마)
│       ├── member.css           # 회원 포털 스타일 (라이트 테마)
│       ├── admin.css            # 관리자 스타일
│       ├── report.css           # 리포트 스타일
│       └── landing.css          # (레거시) 랜딩 스타일
├── supabase/
│   └── migrations/              # 순서대로 실행해야 하는 SQL 파일 15개
└── docs/                        # 작업 문서 폴더
```

---

## 4. 인증 방식

### 트레이너 앱 / 회원 포털 — 커스텀 이름+전화번호 인증
- Supabase Auth **미사용** (auth.uid() = null)
- `trainers` / `members` 테이블에서 `name + phone(뒷 4자리)` 매칭
- RLS 정책: `using (true)` — 앱 레벨에서 trainer_id 필터링
- 세션 유지: React state (새로고침 시 재로그인 필요)

### 커뮤니티 포털 — Supabase Auth (Google OAuth)
- Google 계정으로 로그인 (`signInWithOAuth`)
- 최초 로그인 시 `community_users` 테이블에 프로필 등록 (이름·역할·지역·소개)
- `auth.uid()` = `community_users.auth_id` 로 연결

### 관리자 포털 — 하드코딩 패스워드
- 비밀번호: `trainer2024!` (소스에 하드코딩)
- 실 운영 시 변경 필요

---

## 5. 데이터베이스 전체 스키마

### 핵심 테이블

#### `trainers`
```sql
id uuid PK | name text | phone text | api_key text | created_at timestamp
```
- `api_key`: Gemini API 키 (트레이너별 보유)

#### `members`
```sql
id uuid PK | trainer_id uuid FK(trainers)
| name | phone | kakao_phone | email
| lesson_purpose (default: '체형교정')
| total_sessions | done_sessions | session_price
| target_weight | start_weight | age | height | special_note
| birthdate | address | special_notes
| visit_source | visit_source_memo
| suspended boolean (default: false)
| memo | created_at
```

#### `logs` (수업일지)
```sql
id uuid PK | trainer_id FK | member_id FK
| content text | session_number int
| report_id text | exercises_data jsonb
| created_at timestamp
```

### 건강 / 운동 테이블

#### `health_records`
```sql
id | member_id FK | record_date date
| morning_weight numeric(5,2) | evening_weight numeric(5,2)
| sleep_level int | diet_note text | created_at
```
- `weight` 컬럼도 존재 (morning_weight 복사값)

#### `workout_sessions` (개인운동 세션)
```sql
id | member_id FK | trainer_id FK
| title | workout_date date | duration_min
| exercises jsonb | total_volume numeric
| source text (default: 'trainer') ← 회원 직접 기록: 'member'
| memo | created_at
```

#### `workout_routines` (루틴 템플릿)
```sql
id | trainer_id FK | member_id FK
| name text | exercises jsonb | created_at
```

### 상품 / 결제 테이블

#### `products`
```sql
id | trainer_id FK | name | session_count
| price_excl_tax | price_incl_tax | memo | created_at
```

#### `payments`
```sql
id | trainer_id FK | member_id FK | product_id FK
| product_name | session_count | amount
| tax_included boolean | memo | paid_at | created_at
```

#### `attendance` (출석부)
```sql
id | trainer_id FK | member_id FK
| attended_date date | created_at
UNIQUE(member_id, attended_date)
```

### 정지(홀딩) 테이블

#### `member_holds`
```sql
id | member_id FK | trainer_id FK | product_id FK
| product_name | start_date | end_date
| reason text | photo_url | created_at
```
- Supabase Storage 버킷: `hold-photos` (공개)

### 커뮤니티 테이블

#### `community_posts` ← CommunityPortal 전용 (트레이너 구인구직)
```sql
id | user_id FK(community_users) | category text
| title | content | location | tags jsonb
| status ('open'/'closed') | created_at
```

#### `member_posts` ← MemberPortal 전용 (같은 센터 회원 커뮤니티)
```sql
id | member_id FK | member_name | trainer_id
| content | photo_url | created_at
```

#### `member_reactions`
```sql
id | post_id FK(member_posts) | member_id FK
| reaction text (이모지) | created_at
UNIQUE(post_id, member_id, reaction)
```

### 커뮤니티 사용자 (Google OAuth)

#### `community_users`
```sql
id | auth_id (supabase auth uid)
| name | role | location | bio | phone
| avatar_url | created_at
```
- role 값: `trainer` / `member` / `instructor` / `gym_owner`

#### `contact_requests` (커뮤니티 매칭 연락)
```sql
id | post_id FK | requester_id FK(community_users)
| message | status | created_at
```

### 알림 테이블

#### `push_subscriptions`
```sql
id | trainer_id FK | endpoint | p256dh | auth | created_at
UNIQUE(trainer_id)
```

#### `scheduled_notifications`
```sql
id | trainer_id FK | block_id | scheduled_at
| title | body | sent boolean | created_at
UNIQUE(trainer_id, block_id)
```

#### `subscriptions` (서비스 구독)
```sql
id | trainer_id FK | plan | payment_method
| amount | paid_at | valid_until | memo | created_at
```

---

## 6. 포털별 기능 상세

### 6-1. 트레이너 앱 (`/trainer`)

#### 화면 흐름
```
랜딩 화면 → 로그인 / 등록 → 메인 앱
```

#### 탭 구성
| 탭 | 내용 |
|----|------|
| 회원 | 회원 목록 + 상세 |
| 발송기록 | AI 수업일지 목록 |
| 시간표 | 주간 스케줄 블록 |
| 매출관리 | 매출 분석 + 결제 이력 |

#### 회원 관리
- **회원 추가**: 이름·전화·카카오폰·이메일·생년월일·주소·레슨목적·방문경로·특이사항·총세션·완료세션·단가·메모
- **회원 목록 정렬**: 이름순 / 등록일순 / 만료임박순
- **상태 배지**:
  - 🟢 활성 (잔여 4회 이상)
  - 🟡 만료예정 (잔여 3회 이하)
  - 🔴 만료 (잔여 0회)
  - ⚫ 정지 (suspended = true)
- **상태 필터**: 전체 / 활성 / 만료 / 정지

#### 회원 상세 탭
| 탭 | 내용 |
|----|------|
| 수업일지 | 회원별 로그 목록 (PDF 다운로드 가능) |
| 출석부 | 월별 달력 캘린더 (날짜 클릭으로 출석 토글) |
| 건강기록 | 체중·수면 기록 조회 |
| 결제내역 | 결제 + 취소 목록 |
| 정지기록 | 홀딩 이력 요약 + 목록 + 신규 등록 |
| 개인운동 | 회원이 기록한 운동 세션 (회원 기록 배지 표시) |

#### AI 수업일지 생성
1. 음성 파일 업로드 (또는 텍스트 직접 입력)
2. Gemini AI API 호출 (`gemini-3.1-flash-lite-preview`)
3. 일지 미리보기 → 수정 → 저장
4. 카카오톡 링크 발송 (리포트 공개 URL 생성)

#### 상품 & 결제
- 상품(패키지) 등록: 이름 / 세션수 / 단가(부가세 포함/별도)
- 결제 등록 → `members.total_sessions` 자동 증가
- 결제 취소 → `members.total_sessions` 자동 복원

#### 주간 스케줄
- 24시간 그리드 (세로축: 시간, 가로축: 요일)
- 블록 타입: `lesson` (회원 수업) / `personal` (개인 일정)
- 블록 색상: green / blue / yellow / red / purple
- 취소 처리: 취소 유형 + 상세 사유 기록
- **알림 설정**: ON/OFF 토글 + 분 선택 (5 / 10 / 15 / 30 / 60분 또는 직접 입력)

#### 매출 분석
- 확정 매출: `payments` 합계
- 미진행 세션 잔존가치: 잔여 세션 × 단가
- 주간·월간 소진 세션 수 / 출석률
- 통합 결제 내역 목록

#### Web Push 알림 (브라우저 종료 후에도 동작)
- VAPID 키 기반 브라우저 구독
- Service Worker (`public/sw.js`) 백그라운드 수신
- `push_subscriptions` 테이블에 구독 정보 저장

---

### 6-2. 회원 포털 (`/member`)

#### 화면 흐름
```
랜딩 화면 → 로그인 → 메인 포털
```

#### 탭 구성
| 탭 | 내용 |
|----|------|
| 수업일지 | 내 수업일지 목록 (PDF·복사 가능) |
| 건강기록 | 체중·수면 기록 + 14일 추이 차트 + 목표 설정 |
| 식단기록 | 아침·점심·저녁·간식 기록 |
| 개인운동 | 운동 세션 기록 + 근육 다이어그램 |
| 커뮤니티 | 같은 센터 회원 커뮤니티 |

#### 회원 헤더
- 이름 / 레슨 목적 / 총·완료·잔여 세션 / 진행도 바
- 목표 체중 진행률

#### 건강기록
- 공복 / 저녁 체중 입력
- 수면 레벨 선택: 😴 / 😐 / 🙂 / 😊 (1~4)
- Chart.js 14일 추이 꺾은선 그래프 (목표 체중 점선)

#### 개인운동 탭
- **이번 달 요약**: 운동 횟수 / 총 볼륨 / 전체 기록 수
- **세션 목록**: 날짜·제목·볼륨 카드 (펼치면 상세 + 근육 다이어그램)
- **운동 기록 모달**:
  - 날짜 / 제목 / 시간 / 메모
  - 종목 추가: 자동완성 (EXERCISE_DB 60+종목) → 근육 자동 세팅
  - 세트 추가: 무게 / 횟수 / 휴식
  - 볼륨 자동 계산 (세트 합계)
- **루틴 저장/불러오기**: 자주 하는 운동 템플릿화
- `source: 'member'` 로 저장 → 트레이너도 열람 가능 (회원 기록 배지)

#### 근육 다이어그램 (MuscleDiagram 컴포넌트)
- 앞면 + 뒷면 SVG 신체 실루엣
- 주동근: 해당 근육 색상 100%
- 보조근: 해당 근육 색상 55% 투명도
- 미사용 근육: `#e5e7eb` (라이트 그레이)

| 근육 | 색상 |
|------|------|
| 가슴 | `#ef4444` (빨강) |
| 등 | `#3b82f6` (파랑) |
| 어깨 | `#8b5cf6` (보라) |
| 이두 | `#f97316` (주황) |
| 삼두 | `#06b6d4` (청록) |
| 하체 | `#22c55e` (초록) |
| 코어 | `#eab308` (노랑) |
| 유산소 | `#ec4899` (핑크) |
| 전신 | `#6b7280` (회색) |

#### 회원 커뮤니티 탭
- 같은 `trainer_id` 를 공유하는 회원끼리만 게시글 조회
- 텍스트 + 사진 게시글 작성 (Supabase Storage `community-photos`)
- 이모지 반응: ❤️ 🔥 💪 👏 😮 💯 🙌 (중복 토글 가능)
- 게시글 삭제 (본인만)
- 테이블: `member_posts` + `member_reactions`

---

### 6-3. 커뮤니티 포털 (`/community`)

#### 화면 흐름
```
랜딩 화면 → Google 로그인 → 프로필 등록 (최초 1회) → 피드
```

#### 카테고리 & 접근 권한
| 카테고리 | 볼 수 있는 역할 | 쓸 수 있는 역할 |
|----------|----------------|----------------|
| 💼 직원 구인 | 센터대표, 트레이너 | 센터대표, 트레이너 |
| 🏃 트레이너 찾기 | 회원, 트레이너 | 회원 |
| 📚 수강생 구인(교육) | 전체 | 교육강사 |
| 🏢 트레이너 채용 | 센터대표, 트레이너 | 센터대표 |
| 🔍 센터 구직 | 센터대표 | 트레이너 |

#### 역할 (role)
- `trainer` 트레이너
- `member` 회원
- `instructor` 교육강사
- `gym_owner` 헬스장 대표

#### 게시글 기능
- 카테고리 / 제목 / 내용 / 지역 / 태그
- 게시글 상태: 진행중 / 완료
- 사진 첨부 (Supabase Storage `community-photos`)

#### 연락(매칭) 기능
- 게시글에 "연락하기" → `contact_requests` INSERT
- 게시글 작성자는 `received_contacts` 목록에서 확인
- 게시글 "완료" 처리

#### 내 활동 페이지
- 내가 쓴 글 / 보낸 연락 / 받은 연락 탭

---

### 6-4. 관리자 포털 (`/admin`)

- 비밀번호: `trainer2024!`
- 전체 트레이너 목록 + 회원 수 / 로그 수
- 전체 수업일지 목록 (기간 필터: 일/주/월)
- 구독(결제) 내역 관리
- Supabase 데이터 전체 조회용

---

### 6-5. 리포트 (`/report?id=xxx`)

- 수업일지 공개 URL 공유용
- `logs.report_id` 기반 단일 일지 공개 조회
- 운동 데이터(`exercises_data` JSONB) 렌더링
- 카카오톡 발송 시 이 URL 포함

---

## 7. 랜딩페이지

### 메인 랜딩 (`/`)

#### 디자인
- 배경: `#f8fafc` 라이트 테마 (v2.0 리뉴얼)
- 스티키 네비바: TRAINERLOG 로고 + 포털 버튼
- Hero: Unsplash 트레이너 코칭 사진 + 밝은 오버레이 (우측 30%)

#### 섹션 구성
1. **Hero** — 슬로건 + 2개 CTA 버튼 + 키포인트 pill
2. **트레이너 기능** — 흰 카드 6개 그리드
3. **AI 하이라이트** — 다크 배너 (4단계 플로우)
4. **회원 포털 기능** — 파란 카드 4개 그리드
5. **근육 다이어그램** — SVG 바디 + 근육 태그
6. **포털 선택 CTA** — 다크 배경 + 3개 카드 (트레이너/회원/커뮤니티)
7. **Footer**

### 포털 랜딩 화면 (로그인 전 강제 노출)

각 포털 접속 시 기능 소개 화면 → CTA 클릭 → 로그인

| 포털 | 테마 | 주요 구성 |
|------|------|-----------|
| 트레이너 앱 | 다크 `#0a0f1a` | 6기능 카드 2열 + AI 하이라이트 배너 |
| 회원 포털 | 라이트 `#f5f5f3` | 블랙 히어로 + 4기능 카드 + 근육 SVG |
| 커뮤니티 | 다크 `#0c0c10` | 6카테고리 카드 + 역할별 배너 |

---

## 8. 주요 컴포넌트 & 라이브러리

### `src/lib/exercises.js` — EXERCISE_DB

60+ 운동 종목 데이터베이스. 각 종목:
```js
{ name: '벤치프레스', primary: ['가슴'], secondary: ['어깨','삼두'], eq: '바벨' }
```

- **장비 분류**: 바벨 / 덤벨 / 케이블 / 머신 / 맨몸
- **사용처**: 회원 포털 운동 자동완성, 근육 다이어그램 자동 설정

### `src/lib/push.js` — Web Push

```js
subscribeToPush(trainerId)           // VAPID 구독 → push_subscriptions 저장
scheduleNotification(trainerId, ...) // scheduled_notifications INSERT
deleteScheduledNotification(...)     // 취소된 블록 알림 제거
```

### `public/sw.js` — Service Worker

```
push event → notification 표시 (🏋️ TrainerLog)
notificationclick → 앱 탭 포커스 또는 새 창 열기
```

### `src/components/common/Toast.jsx`

- `ToastProvider` → 전역 context 제공
- `useToast()` hook → `showToast(message)` 함수 반환
- 우하단 고정, 3초 후 자동 소멸

### `src/components/common/Modal.jsx`

- 공통 모달 래퍼
- `isOpen`, `onClose`, `title`, `children` props

---

## 9. 마이그레이션 전체 목록

> Supabase SQL Editor에서 순서대로 실행

| 파일 | 내용 | 생성 테이블 / 컬럼 |
|------|------|--------------------|
| `001_init.sql` | 초기 스키마 | trainers, members, logs, health_records |
| `002_lesson_purpose_subscriptions.sql` | 레슨 목적 + 구독 | members.lesson_purpose, subscriptions |
| `003_health_weight_profile.sql` | 체중·신체 프로필 | health_records (체중·수면), members (체형) |
| `004_report_exercises.sql` | 리포트·운동 데이터 | logs.report_id, logs.exercises_data |
| `005_kakao_phone_session_price.sql` | 카카오폰·단가 | members.kakao_phone, members.session_price |
| `006_attendance_products_payments.sql` | 출석·상품·결제 | attendance, products, payments |
| `007_web_push.sql` | 푸시 알림 인프라 | push_subscriptions, scheduled_notifications |
| `008_member_fields.sql` | 회원 추가 필드 | members (birthdate·address·suspended 등) |
| `009_member_holds.sql` | 정지 이력 | member_holds |
| `010_hold_photos_bucket.sql` | 정지 사진 버킷 | Storage: hold-photos |
| `011_fix_holds_rls.sql` | RLS 정책 수정 | member_holds RLS → using(true) |
| `012_workout_logs.sql` | 개인운동 로그 | workout_sessions, workout_routines |
| `013_community.sql` | ⛔ 스킵 — 충돌 | (community_posts 스키마 충돌) |
| `014_workout_source.sql` | 운동 출처 컬럼 | workout_sessions.source |
| `015_member_community.sql` | 회원 커뮤니티 | member_posts, member_reactions, Storage: community-photos |

> **주의**: `013_community.sql`은 CommunityPortal이 이미 사용하는 `community_posts` 테이블과 스키마 충돌 → **실행 금지**. `015_member_community.sql`이 대체.

---

## 10. 커밋 이력 전체

| 커밋 | 날짜 | 내용 |
|------|------|------|
| `8175654` | 04-08 | Vite + React SPA로 마이그레이션 |
| `d1c9e2d` | 04-09 | kakao_phone·session_price·매출탭·일정취소 |
| `464ad04` | 04-09 | SQL migrations 폴더 정리 |
| `395cc12` | 04-09 | 회원 수정·삭제 기능 |
| `21155a0` | 04-09 | 출석 달력·결제 시스템·매출 분석 |
| `67fadde` | 04-09 | Gemini 모델 업데이트 (2.0-flash-lite) |
| `d88630e` | 04-09 | Gemini 모델 업데이트 (3.1-flash-lite-preview) |
| `2419f9d` | 04-09 | 회원 목록 정렬 기능 |
| `d635140` | 04-09 | 결제 취소 확인 다이얼로그 |
| `f324c7e` | 04-09 | 24h 스케줄 그리드 + 푸시 알림 시스템 |
| `846f992` | 04-09 | Service Worker 추가 |
| `76db424` | 04-09 | Web Push VAPID 브라우저 종료 시 알림 |
| `62ea0f5` | 04-09 | 알림 설정 UI 시간표 탭으로 이동 |
| `d7e3639` | 04-09 | 회원관리 신규 필드 + 상태 배지 + 필터 |
| `e6b13b8` | 04-10 | 회원 정지(홀딩) 기능 |
| `857c9c3` | 04-10 | hold-photos 스토리지 버킷 마이그레이션 |
| `7e317e3` | 04-10 | 회원 상세 정지기록 탭 추가 |
| `ada6fa9` | 04-10 | 정지기록 버그 수정 (RLS + INSERT 오류) |
| `be73d47` | 04-10 | docs: 2026-04-10 작업내용 정리 |
| `e098dfa` | 04-13 | 개인운동일지 탭 추가 |
| `03d6203` | 04-13 | 회원포털 개인운동 + 근육 다이어그램 + 커뮤니티 탭 |
| `3c68500` | 04-13 | 회원 개인운동 트레이너 열람 + 커뮤니티 UX |
| `88365c9` | 04-14 | 커뮤니티 테이블 충돌 해결 (member_posts 분리) |
| `a782dbe` | 04-14 | '잔여 예상 수익' → '미진행 세션 잔존가치' |
| `a192ddf` | 04-14 | 랜딩페이지 전면 개편 (수익화 대응) |
| `9ab6424` | 04-14 | 랜딩 Hero 배경사진 추가 |
| `aa5ef41` | 04-14 | 랜딩 앰비언트 글로우 블롭 추가 |
| `a4c34b3` | 04-15 | 랜딩 라이트 테마 + 포털별 랜딩 화면 추가 |
| `bf966e7` | 04-15 | docs: 2026-04-15 작업내용 정리 |

---

## 11. 알려진 이슈 & 주의사항

### RLS 정책
- 트레이너·회원 포털은 Supabase Auth **미사용** → 대부분 테이블이 `using(true)`
- 보안은 앱 레벨에서 `trainer_id` / `member_id` 필터로 처리
- 실제 운영 시 RLS를 더 엄격하게 설정 권장

### 마이그레이션 주의
- `013_community.sql` **절대 실행 금지** — CommunityPortal의 기존 `community_posts` 덮어쓸 경우 스키마 충돌
- `011_fix_holds_rls.sql` 실행 필요 (기존 `009`의 RLS가 `auth.uid()` 기반으로 잘못 설정됨)

### 세션 유지
- 트레이너/회원 로그인 정보는 React state에만 저장
- 브라우저 새로고침 시 재로그인 필요

### Gemini API 키
- 트레이너별 개별 API 키 (`trainers.api_key`)
- 설정 모달에서 변경 가능
- 미입력 시 AI 수업일지 생성 불가

### Web Push
- `VITE_VAPID_PUBLIC_KEY` 환경변수 필요
- 브라우저 알림 권한 필요 (최초 1회 허용)
- Supabase Edge Function + pg_cron 미구성 시 백그라운드 발송 미동작

### 워크트리 vs 메인 프로젝트
- 이 문서는 `claude/youthful-colden` 워크트리 기준
- 이 브랜치의 최신 커밋: `03d6203` (2026-04-13)
- `main` 브랜치에는 이후 작업(랜딩 개편 등)이 추가되어 있음
- 최신 코드는 `main` 브랜치 기준 확인 필요
