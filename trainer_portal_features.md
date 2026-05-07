# Trainer Portal — 현재 구현 기능 명세

> 작성 기준: 코드베이스에 100% 구현 · 작동이 확인된 기능만 기재. 기획 단계 또는 미구현 항목 제외.
> 주요 파일: `src/pages/TrainerApp.jsx` (단일 파일 SPA, 6 000 줄 이상)

---

## 1. 전체 화면 구조 및 라우팅

### SPA 라우팅 구조

| URL 경로 | 화면 | 설명 |
|---|---|---|
| `/` | 로그인 / OAuth | Google · Kakao OAuth 로그인, 이메일+이름 회원가입 |
| `/trainer` | TrainerApp | 트레이너 포털 메인 (sessionStorage로 탭 위치 유지) |
| `/report?id=...` | 리포트 뷰어 | 회원이 카카오 링크로 접근하는 수업 일지 열람 페이지 |

### 메인 탭 목록 (6개)

| 탭 key | 라벨 | 플랜 게이트 | 주요 내용 |
|---|---|---|---|
| `members` | 회원 | 없음 (무료 5명 제한) | 회원 CRUD, 검색, 필터, 위험도 정렬 |
| `history` | 발송기록 | `history_tab` | 수업 일지 발송 이력, 읽음 여부 확인 |
| `schedule` | 시간표 | `schedule_tab` | 주간 달력, 수업/개인 블록 관리, 웹 푸시 |
| `revenue` | 매출관리 | `revenue_tab` | 월별 매출, 결제 내역, 상품 관리 |
| `settings` | 설정 | 없음 | 프로필, 플랜 정보, 헬스장 소속, API 키 |
| `support` | 문의 | 없음 | 1:1 문의 생성 및 답변 확인 |

### 회원별 상세 화면 (page-record) — 6개 서브탭

| 서브탭 | 라벨 | 주요 내용 |
|---|---|---|
| `write` | 📝 수업일지 | STT 입력 → AI 일지 생성 → 카카오 발송 |
| `attendance` | 📅 출석부 | 월별 출석 달력, 날짜 클릭 토글 |
| `health` | ⚖️ 건강기록 | 체중(아침/저녁), 수면, 일별 변화량 |
| `holds` | ⏸ 정지기록 | 정지 기간 생성/삭제, suspended 상태 자동 동기 |
| `personal` | 🏃 개인운동 | 워크아웃 세션 CRUD, 루틴 라이브러리 |
| `insight` | 🤖 AI 분석 | 이탈 위험도 점수 + AI 회원 인사이트 (`ai_insight` 게이트) |

---

## 2. 수업 스케줄 및 예약 관리

### 달력/목록 뷰

- **주간 뷰** (Mon–Sun 고정): 날짜 헤더 + 블록 슬롯 렌더링
- 이전/다음 주 탐색 (`<` `>` 버튼)
- 블록 종류: `lesson` (수업), `personal` (개인 일정)
- 블록 컬러 커스터마이징 (UI 색상 팔레트)
- 담당 회원 지정 (lesson 블록 한정)
- 블록 수정/취소 (취소 사유 텍스트 저장)

### 웹 푸시 알림

- Service Worker(`/sw.js`) 기반 백그라운드 알림
- 알림 리드타임: 5 / 10 / 15 / 30 / 60분 또는 직접 입력
- 알림 예약 상태 `localStorage` 저장
- 30초 인터벌로 알림 트리거 여부 폴링

### 출석 처리 로직 (page-record > attendance 탭)

- `attendance` 테이블에서 `(trainer_id, member_id, attended_date)` 조합으로 조회
- 달력 날짜 클릭 → 기록 없으면 INSERT, 있으면 DELETE (토글)
- 월별 출석 횟수 카운트 → 화면 상단 통계 표시
- 출석일 목록 최신순 정렬 표시

---

## 3. 핵심 기능: STT 기반 수업 일지 작성

### 3-1. 음성 인식 (STT)

| 항목 | 구현 내용 |
|---|---|
| **API** | Web Speech API (`window.SpeechRecognition \|\| window.webkitSpeechRecognition`) |
| **언어** | `ko-KR` 고정 |
| **인식 모드** | `continuous: false`, `interimResults: false` (발화 1회 완결 후 결과 반환) |
| **상태 관리** | `isListening` boolean state. `recognition.start()` → `onresult` → transcript를 `rawInput` state에 누적 → `recognition.onend`/`onerror`로 종료 동기화 |
| **에러 처리** | `aborted`, `no-speech` 오류는 무시. 그 외 오류는 showToast로 사용자에게 표시 |

### 3-2. AI 일지 생성 흐름

```
[1단계 — 입력 수집]
  STT 마이크 버튼 토글
    └─ 음성 → Web Speech API → rawInput textarea 누적
  운동 로거 (exercise logger)
    └─ 운동명 추가 → 세트별 {weight, reps, RIR(0/1/2), feel} 입력
  미디어 첨부
    └─ JPG/PNG/MP4/MOV 최대 5파일
    └─ MP4/MOV: FFmpeg.wasm으로 브라우저 내 자동 압축 후 Supabase Storage 업로드

[2단계 — AI 생성]
  buildSessionLogPrompt(trainer, member, exercises, rawInput, perspective)
    └─ perspective 4종: rehab / motivation / performance / diet
  callGemini(prompt, apiKey, { timeoutMs: 30000 })
    └─ 모델: gemini-2.5-flash-lite (app_settings.gemini_api_key 사용)
    └─ 크레딧 선차감: use_ai_credit(p_trainer_id) RPC → { success, credits }
    └─ success=false이면 생성 중단, 토스트 표시

[3단계 — 검토 및 발송]
  AI 생성 텍스트 → 미리보기 textarea (직접 수정 가능)
  sendKakao() 호출:
    └─ logs INSERT (아래 DB 저장 참조)
    └─ members UPDATE: done_sessions += 1
    └─ 카카오 공유 URL 생성: /report?id={log.id}
    └─ 클립보드 복사 → 카카오톡 직접 붙여넣기 방식
```

### 3-3. 일지 DB 저장

**테이블: `logs`**

| 컬럼 | 저장 값 |
|---|---|
| `trainer_id` | 현재 로그인 트레이너 UUID |
| `member_id` | 대상 회원 UUID |
| `content` | AI 생성 최종 텍스트 (수정본 포함) |
| `session_number` | `member.done_sessions + 1` (저장 시점 기준) |
| `exercises_data` | `[ { name, sets: [ { weight, reps, rir, feel } ] } ]` JSON 배열 |
| `report_id` | 공유 URL용 UUID (별도 생성 또는 log.id 사용) |
| `created_at` | 자동 생성 (DB default) |
| `read_at` | 회원이 링크 열람 시 UPDATE (`/report` 페이지에서 처리) |

**연계 UPDATE:**
```sql
UPDATE members SET done_sessions = done_sessions + 1 WHERE id = {member_id}
```

---

## 4. 회원 및 권한 관리

### 회원 목록 조회

```js
supabase.from('members')
  .select('*')
  .eq('trainer_id', trainer.id)
  .order('created_at', { ascending: false })
```

- **필터**: 상태별 (active / expiring / expired / suspended)
- **정렬**: 등록일 / 이름 / 만료일 / 위험도 점수
- **검색**: 이름 · 전화번호 부분 일치
- **회원 수 제한**: 무료 플랜 5명, 유료 플랜 9 999명 (`member_limit` 게이트)

### 회원 등록 폼 (14개 필드)

`name`, `phone`, `kakao_phone`, `birthdate`, `address`, `email`, `lesson_purpose`, `visit_source`, `visit_source_memo`, `total_sessions`, `session_price`, `memo`, `special_notes`, `target_weight`

### 이탈 위험도 계산

- `computeRiskScore()` (클라이언트 순수 함수, `churnRisk.js`)
- 입력: 마지막 출석일, 잔여 세션, 만료일, 정지 여부
- 출력: 점수(0–100) + 레벨 (`green` / `yellow` / `red` / `critical`)
- `buildMemberInsightPrompt()` → Gemini AI → AI 인사이트 텍스트 (`ai_insight` 게이트)

### 결제 관리 (`revenue` 탭 · 회원 detail)

- 결제 수단 5종: `cash` / `card` / `transfer` / `local_currency` / `payments_app`
- 상품(products) CRUD: 이름, 세션 수, 세금포함가/별도가
- 월별 매출 집계: `payments` 테이블에서 `paid_at` 범위 필터 후 합산
- 결제 취소: `payments` 레코드 DELETE + `members.done_sessions` 역산

---

## 5. 데이터 아키텍처 및 통신

### 주요 Supabase RPC

| RPC 이름 | 파라미터 | 반환 | 용도 |
|---|---|---|---|
| `use_ai_credit` | `p_trainer_id` | `{ success, credits }` | AI 일지 생성 시 크레딧 1 차감 |
| `get_ai_usage` | `p_trainer_id` | `{ plan, limit, used, remaining, blocked }` | 앱 마운트 시 AI 사용량 로드 |
| `calculate_settlement` | `p_trainer_id, p_year, p_month` | 정산 스냅샷 | 매출관리 탭 정산 계산 |
| `get_snapshot_preview` | `p_trainer_id, p_year, p_month` | 스냅샷 미리보기 | 매출관리 탭 프리뷰 |
| `get_member_retention` | `p_gym_id` | `{ member_id, expiry_warning, absence_warning, last_attended_date }` | 회원 만료·결석 경보 |

### 주요 테이블 조인 패턴

```js
// 수업 일지 + 회원명 조인
supabase.from('logs')
  .select('*, members(name)')
  .eq('trainer_id', trainer.id)
  .order('created_at', { ascending: false })

// 회원 + 최근 결제 조인 (위험도 계산용)
supabase.from('members')
  .select('*, payments(paid_at, session_count, amount)')
  .eq('trainer_id', trainer.id)

// 정지 기록 + 상품 조인
supabase.from('member_holds')
  .select('*, products(name)')
  .eq('member_id', member.id)
```

### 핵심 테이블 목록

| 테이블 | 주요 컬럼 |
|---|---|
| `trainers` | id, auth_id, name, email, gym_id, profile_photo_url, employment_status |
| `members` | id, trainer_id, name, phone, total_sessions, done_sessions, session_price, suspended |
| `logs` | id, trainer_id, member_id, content, session_number, exercises_data (JSON), report_id, created_at, read_at |
| `payments` | id, trainer_id, member_id, product_id, amount, session_count, payment_method, paid_at, tax_included |
| `products` | id, trainer_id, name, session_count, price_ex, price_in |
| `attendance` | id, trainer_id, member_id, attended_date |
| `health_records` | id, member_id, record_date, morning_weight, evening_weight, sleep_level |
| `member_holds` | id, member_id, product_id, start_date, end_date, reason, photo_url |
| `workout_sessions` | id, member_id, date, title, duration_min, exercises_data (JSON) |
| `workout_routines` | id, member_id, name, exercises_data (JSON) |
| `inquiries` | id, trainer_id, category, title, content, answer, answered_at |
| `app_settings` | key, value — `gemini_api_key`, `feature_gates`, `plans`, `leaderboard_enabled` |

### 피처 게이트 (`feature_gates`)

`app_settings` 테이블에서 마운트 시 1회 로드. `trainer.isPaid` 플래그로 전환.

| 게이트 키 | 무료 | 유료 |
|---|---|---|
| `ai_journal` | ✗ | ✓ |
| `history_tab` | ✓ | ✓ |
| `revenue_tab` | ✗ | ✓ |
| `settlement` | ✗ | ✓ |
| `ai_insight` | ✗ | ✓ |
| `risk_analysis` | ✗ | ✓ |
| `push_notif` | ✗ | ✓ |
| `schedule_tab` | ✓ | ✓ |
| `member_limit` | 5명 | 9 999명 |

---

*파일 생성일: 2026-05-03*
