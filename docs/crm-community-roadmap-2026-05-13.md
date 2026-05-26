# CRM / Community 고도화 진단 + 5단계 계획 (2026-05-13)

> 진단 + 계획 문서. 코드 변경 없음. 다음 세션 작업 우선순위 결정용.
> 본 세션 산출 = 이 문서 1건.

## Context

베타 1차 출시 (Phase E) 완료 후 ownapp.kr 운영 배포 영역 = 트레이너 앱 + 회원 앱만. CRM 포털(`apps/crm`)과 Community(`apps/portal/.../Community*`)는 코드는 완성되어 있으나 운영에선 ComingSoon 으로 차단된 상태. 본 세션은 **운영 배포 가능 여부 / 깨질 위험 / 경쟁사 대비 차별화 / 비용 0 제약 하의 로드맵** 을 한 번에 진단해 다음 세션 작업 우선순위를 정하기 위한 계획.

**제약 재확인:**
- 1인 개발자 / 베타 인프라 비용 $0 / 법적 리스크 회피 / ship-first / 락인 회피 / ops 초보자

---

## 1단계 — 기존 구현 기능 인벤토리

### A. CRM 포털 (`apps/crm`, port 3020) — 11+ 탭

**진입 구조:** `GymPortal.jsx` (랜딩/OAuth) → `pages/crm/GymOwnerPortal.jsx` (실제 대시보드). sessionStorage 기반 탭 상태, role + `trainers.crm_permissions` JSONB 2층 RBAC. Gemini API 키는 **localStorage 평문 저장 후 클라이언트에서 직접 호출**.

| # | 탭 | 컴포넌트 | 역할 | 주요 테이블 / RPC |
|---|---|---|---|---|
| 1 | 대시보드 | DashboardTab | 오늘 수업·신규회원·매출·이탈위험 KPI | members, payments, member_risk_scores |
| 2 | 회원 관리 | MembersTab | 회원 조회·결제·환불·이탈 분석 | members, payments, attendance, health_records, `process_refund_and_cascade` RPC |
| 3 | 센터 정산 | CenterSettlementTab | 월별 매출·트레이너 정산·영업료 | attendance, rental_fees, trainers, payments, gym_ranks |
| 4 | 상품 관리 | ProductsTab | PT·회원권 CRUD | gym_products (직접 CRUD) |
| 5 | 수업 예약 | ScheduleTab | 센터 일정/예약 | (테이블 미확인) |
| 6 | 전자 계약서 | ContractsTab | 디지털 계약 | gym_contracts |
| 7 | 알림 발송 | NotificationsTab | 공지·프로모션 | (미확인) |
| 8 | 주간 리포트 | ReportsTab | AI 주간 운영 분석 | gym_weekly_reports, `create_pending_weekly_report` RPC, Gemini |
| 9 | 센터 설정 | SettingsTab | 직원 CRUD + crm_permissions | trainers, gym_ranks, gyms |
| 10 | 트레이너 정산 | TrainersTab | 트레이너 정산 라이프사이클 | settlements + `get_snapshot_preview` / `calculate_settlement` / `confirm_settlement` / `mark_settlement_paid` RPC |
| 11 | 급여 정산 | StaffPayrollTab | 직원 급여 집계 | members, gym_ranks, payments (합산) |

**공유 lib 의존:** `@trainer-log/shared/lib/{supabase, permissions, churnRisk, gymReport, memberInsights, ai_templates}`

### B. Community (`apps/portal/src/pages/CommunityPortal.jsx`, 3,800+ 줄)

**운영 상태:** App.jsx 의 `/community` 라우트는 ComingSoon 으로 차단. 코드는 완성.

| 기능 | 테이블 | 비고 |
|---|---|---|
| 회원 갤러리 피드 | community_posts | 게시글·이미지 (storage `community-posts` 버킷) |
| 이모지 반응 | post_reactions | unique(post_id, member_id) |
| 마켓플레이스 | (market_purchases 외) | 상품 거래, 구매 요청 |
| 1:1 연락 메시지 | community_contacts | 트레이너↔회원 |
| 사용자 프로필 + 관리자 권한 | community_users | `admin_permissions` JSONB |

### C. 공유 데이터 모델 (DB 표면)

`gyms`, `trainers`, `members`, `attendance`, `payments`, `health_records`, `logs`, `rental_fees`, `gym_products`, `gym_contracts`, `gym_ranks`, `settlements`, `gym_weekly_reports`, `community_*`, `trainer_signup_requests`, `app_settings`, `member_risk_scores`.

**마이그레이션 053까지:** 050/051 = RLS strict (trainers/members/logs/payments/attendance auth.uid() 기반), 052 = admin SECURITY DEFINER RPC 6종 + 토큰 매칭, 053 = 트레이너 가입 화이트리스트 (trainer_signup_requests + admin_approve_signup_request).

---

## 2단계 — 운영 배포 시 깨질 위험 + 우선순위

### 핵심 발견: Community RLS 의 P0 누출 위험

013/015 마이그레이션의 `community_posts` / `community_users` / `post_reactions` RLS = **`allow_all (using true)`**. anon key 만으로 모든 게시글 내용 + 회원 이메일/이름 + admin_permissions 토큰까지 조회 가능. 운영 배포 즉시 PIPA 위반 + 관리자 권한 노출.

### 위험 인벤토리

| # | 영역 | 위험 | 우선 | 작업량 | 락인 | 해결 방향 |
|---|---|---|---|---|---|---|
| R1 | Community RLS | `community_posts/users/contacts` allow_all → anon key 로 전 회원 PII + 게시글 + 관리권한 토큰 노출 | **P0** | 0.5d | 낮음 | 새 마이그 054: auth.uid() 기반 strict RLS + storage 정책 동일 적용 |
| R2 | Gemini 키 노출 | ReportsTab 이 localStorage 평문 키 → 클라이언트 직접 호출. CRM 운영 배포 시 사용자 헬스장마다 키 강제 + 도용 위험 | **P0** | 1d | 낮음 | Edge Function 프록시 + 헬스장별 사용량 캡 (주간 리포트 패턴 재사용) |
| R3 | CRM anon 직접 CRUD | `gym_products / payments / trainers / rental_fees` 등에서 anon INSERT/UPDATE/DELETE. gym_id 필터는 있으나 RLS 정책 부재 시 cross-gym 쓰기 가능 | **P0** | 1-1.5d | 낮음 | 마이그 055: gym_id auth.uid() 매핑 RLS 또는 SECURITY DEFINER RPC 전환 (052 admin 패턴 재사용) |
| R4 | 빈 row 가드 (PostgREST composite NULL) | `trainer_resolve_or_create` / `member_resolve_self` NULL → `{}` 변환 시 클라이언트 분기 누락. CommunityPortal/MemberPortal 에서 가드 미발견 | P1 | 0.5d | 낮음 | 호출부 NULL 분기 + 마이그에서 `RETURNS jsonb` 일관화 |
| R5 | community 1:1 메시지 | `community_contacts` RLS 정책 미문서화. 가입자 ↔ 회원 사이 메시지가 anon 으로 읽힐 위험 | P1 | 0.5d | 낮음 | R1 와 묶어 새 마이그에 포함 |
| R6 | settlement / payments 정합성 | `process_refund_and_cascade` / `calculate_settlement` 동시성 검토 미실시. 정산 확정 후 결제 환불 → 음수 정산 가능성 | P2 | 1d | 낮음 | 트랜잭션 락 + dry-run 모드 점검 |
| R7 | RBAC 누수 (crm_permissions) | SettingsTab 에서 `trainers.crm_permissions` JSONB UPDATE → 직원이 자기 권한을 위변조할 가능. role='owner' 필터만 검증 필요 | P2 | 0.5d | 낮음 | RPC 로 변경 + before-update trigger 로 role 검증 |
| R8 | 모더레이션 부재 | Community 게시글 신고/숨김/차단 기능 없음. 베타 30명에선 미미하나 정식 출시 시 PIPA 의무 | P3 | 2-3d | 중간 | 신고 테이블 + 관리자 hide 토글 |
| R9 | AI 비용 폭탄 | ReportsTab Gemini 호출에 rate limit 없음 (주간 리포트 본체는 fix 됐다고 알려졌으나 CRM ReportsTab 별도) | P1 | 0.5d | 낮음 | gym_weekly_reports 에 호출 카운트 + 주 N회 제한 |
| R10 | Admin 토큰 노출 | 052 의 `<<ADMIN_TOKEN>>` + `.env VITE_ADMIN_DB_TOKEN` — VITE_* prefix 는 클라 번들에 포함됨. 토큰 정적 검증은 service_role 미사용 안전장치지만 노출됨 | P2 | 0.5d | 낮음 | 토큰 회전 SOP + admin 영역 자체 service-side (옵션 C 유지) |

**P0 합계: 3개 / 약 2.5일 작업.** 운영 배포 차단. CRM/Community 배포 전 필수.

---

## 3단계 — 브로제이 외 경쟁사 비교

### 시장 지형

| 경쟁사 | 위치 | 가격 | 핵심 차별화 |
|---|---|---|---|
| **바디코디** | 시장 1위 (4,000개 센터) | 월 138,600~220,000원 | 키오스크 / 출입통제 통합 |
| **브로제이** | 중저가 진입 (broj.co.kr) | 월 29,000원~ | 얼굴인식 출석 + 전자계약서 |
| **포인티** | 1:1 PT 특화 | (정보부족) | 퍼스널레포트 + 카카오톡 연동 |
| **핏투비** | 다목적 (필라/복싱) | (정보부족) | QR 출입 + 온라인 회원권 판매 |

### 항목별 비교 (오운 CRM 기준)

| 항목 | 브로제이 | 오운 CRM | 평가 |
|---|---|---|---|
| 회원 관리 | 등록·검색·멤버십 | 등록·결제·환불·이탈위험 + 무료 | **우위** (이탈 분석) |
| 일정/예약 | 수업예약·Noshow | ScheduleTab (구현 미확인) | 동등~열위 |
| 출석 | **얼굴인식 자동** | (수동, 회원 앱 체크인) | **열위** (하드웨어 X) |
| 결제/정산 | 무인결제, PG 연동 (상세 불명) | TrainersTab 정산 라이프사이클 (4-step RPC), PG **미연동** | 정산 우위 / 결제 열위 |
| 운동 일지 / 플랜 | 플랜 제작도구 (국내특허 2건) | TrainerApp 일지 + Member 운동 기록 + AI 일지 | **우위** (AI) |
| 리포팅 | 회계관리·대시보드 | 주간 리포트 (Gemini AI) | **우위** (AI) |
| 알림 | 푸시·SMS·이메일 | Web Push + 카카오 알림톡 (인앱 브라우저 안내) | 동등 |
| 전자계약서 | ✓ (법적 유효성) | ContractsTab (서명 흐름 미확인) | 동등~열위 |
| 모바일 앱 | iOS/Android 네이티브 | PWA (트레이너/회원), CRM 은 웹 | **열위** (네이티브) |
| AI 기능 | △ (AWS 기반, 미상) | 일지·리포트·이탈예측 (Gemini) | **우위** |
| 가격 | 월 2.9만원~ | $0 (베타) | **우위** (단기) |
| 브랜드 인지도 | AWS 사례연구, 세종 창업 우수 | 베타 30명 | **열위** |
| 멀티 센터 / 직원 권한 | 트레이너별 일정·급여 | `crm_permissions` JSONB 세밀 제어 | **우위** (세밀도) |

### 요약

**우위 (오운):** AI 일지/리포트/이탈예측 / 0원 / `crm_permissions` 세밀 RBAC / 1인 강사 친화.

**열위 (오운):** 하드웨어 (얼굴인식·키오스크·출입통제) / PG 결제 미연동 / 네이티브 모바일 앱 / 브랜드 인지도 / 검증된 정산 트랙레코드.

**기회 (포지셔닝):**
- 브로제이는 **헬스장 본부** 중심, 오운은 **1인 강사 + 작은 PT 스튜디오** 중심으로 차별화
- AI 일지·이탈예측은 경쟁사 대비 명확한 차별화 (특히 1인 강사가 직접 시간 절약)
- PG 미연동 = 결제 흐름 약하나, 1인 강사 시장은 계좌 입금·현금이 흔해 단기 치명적이지 않음

---

## 4단계 — 고도화 방향 (1인 개발자 / 비용 0 / 법적 리스크 회피)

### Phase 1 (즉시, 2-3주) — 운영 배포 가능 상태 만들기 (P0 청소)

| 작업 | 작업량 | 비용 | 락인 |
|---|---|---|---|
| R1: Community RLS strict 마이그(054) | 0.5d | 0 | 없음 |
| R3: CRM anon 직접 CRUD → RPC 또는 RLS(055) | 1.5d | 0 | 없음 |
| R2: Gemini Edge Function 프록시 + 캡 | 1d | 0 (Supabase Edge 무료 한도) | 없음 |
| R4/R5: NULL 가드 + community_contacts RLS | 1d | 0 | 없음 |
| R9: CRM Reports Gemini rate limit | 0.5d | 0 | 없음 |
| 합계 | **~5d** | $0 | — |

### Phase 2 (베타 4-8주차, 운영 데이터 기반) — 차별화 가속

| 작업 | 가치 | 작업량 | 비용 |
|---|---|---|---|
| AI 이탈예측 알림 (Web Push) | 1인 강사 회원 유지 핵심 | 1주 | 0 |
| 회원 인사이트 자동 요약 (TrainerApp 통합) | 일지 → 액션 전환 | 1주 | 0 (Gemini) |
| Community 모더레이션 MVP (R8) | PIPA 보호 + 30명+ 대응 | 2-3d | 0 |
| 결제 PG 연동 — Toss Payments 위주 (테스트) | 정식 출시 준비 | 1.5-2주 | $0 (Toss 수수료만) |
| CRM 모바일 반응형 보정 | 1인 강사 현장 사용 | 2-3d | 0 |

### Phase 3 (정식 출시 직전, 베타 12주차+) — 수익화 / 확장

| 작업 | 가치 | 작업량 | 비용 |
|---|---|---|---|
| 플랜 게이팅 (Free/Pro) — Stripe or Toss | 수익화 | 2주 | 결제 수수료 |
| Supabase Free 한계 점검 + 유료 검토 | 확장성 | 0.5d | 가능 시 $25/월 |
| Vercel Hobby 상용 사용 제한 검토 + Pro 전환 | 법적 | 0.5d | $20/월 가능 |
| 약관/개인정보 PIPA 정기 점검 | 법적 | 1d | 0 |
| 네이티브 모바일 (Capacitor PWA → 앱스토어) | 브랜드 | 2-3주 | $25 + 99/yr |

**ship-first 원칙:** Phase 3 는 베타 데이터 본 후 재평가. 현 시점 결정 X.

---

## 5단계 — CRM / Community 배포 결정 트리

### 옵션 비교

| 옵션 | 시작 즉시 | 사용자 부담 | 인프라 비용 | 정식 전환 비용 | 베타 30명 가치 |
|---|---|---|---|---|---|
| **A. 별도 도메인** (crm/community.ownapp.kr) | Phase 1 후 | URL 기억 부담 | $0 (Vercel Hobby) | 중간 | 중 |
| **B. portal 통합** (ownapp.kr/crm) | Phase 1 후 | 0 | $0 | 낮음 | 중-상 |
| **C. local 유지** (현재) | 즉시 | 0 (CRM 사용자=본인) | $0 | 0 | **낮음** |
| **D. 정식 출시 단계 별 repo** | Path B 다음 | — | $0 | 낮음 | — |

### 🎯 추천 — 단계적 옵션 C → B (Community 만 먼저 B)

**현 시점:** 옵션 **C 유지** + Community 만 Phase 1 끝나면 옵션 **B 로 부분 배포**.

근거:
1. CRM 은 1인 강사 베타에서 사용자 0 — 운영 배포해도 트래픽 없음
2. Community 는 베타 30명 만족도 + 신규 모집 채널로 가치 큼
3. 옵션 B (portal 통합) 는 락인 낮고 즉시 가능 — ComingSoon 해제 + R1 P0 fix 만으로 충분
4. CRM 운영 배포는 정식 출시 단계에서 옵션 D 로 점프. 그동안 1인 강사 회원관리는 트레이너 앱으로 충분

### 즉시 작업 (다음 세션)

```
1. (필수) 마이그 054 — community_* RLS strict (R1)
2. (필수) 마이그 055 — community_contacts RLS strict + RPC NULL 가드 (R4/R5)
3. (필수) Community 라우트 ComingSoon 해제 (R1/R5 검증 후)
4. (생략 가능) CRM ReportsTab Gemini rate limit (R9) — CRM 미배포라 Phase 2 로
5. CRM 운영 배포 = 옵션 C 유지로 No-op
```

→ 다음 세션 작업량 ≈ 2일.

---

## 보완 1 — 자동 출입제어 (생체 X / 도용 X / 자동문 X / 비용 최소화)

### 제약 재정의

| 제약 | 의미 |
|---|---|
| 생체정보 회피 | 얼굴/지문/홍채 X — PIPA 민감정보 부담 |
| QR 도용 회피 | 정적 QR(스크린샷 공유) X — 본인만 사용 가능 |
| 자동문 미설치 | 미닫이 자동개폐(수백만원) X — 수동 문 + 스마트 도어락 retrofit |
| 비용 최소화 | 1회 ~30만원, 월 운영 ~0원 |

### 권장 — "원-탭" 아키텍처 (입구 태블릿 제거)

```
[회원 폰] ──[입장 버튼 1탭 + GPS]──▶ [Edge Function] ──unlock──▶ [스마트 도어락]
                                          └──INSERT──▶ [attendance]
```

**4-layer 검증:** ① auth.uid() ② GPS 반경 50m (+WiFi BSSID) ③ 회원권 활성 OR 예약 시간 ±15분 ④ 30초 중복 차단.

| 옵션 | 디바이스 | 링크 | 개발 | 디버깅 | 도용 방지 |
|---|---|---|---|---|---|
| **A. 원-탭** ⭐ | 폰+도어락 | 2 | 4-5d | 낮음 | 매우 강 |
| B. OTP+태블릿 | 폰+태블릿+도어락 | 4 | 6-8d | 중간 | 매우 강 |
| C. BLE 자작(ESP32) | 폰+ESP32 | 1 | 10-14d | 높음 | 강 |
| D. BLE+SmartThings | 폰+Samsung도어락 | 1 | 5-7d | 중간 | 매우 강 |

**비용:** 도어락 ~15만원(1회), 월 $0, 개발 5-6d (Fallback 포함).

**Fallback:** Edge Function 다운 → 도어락 비밀번호 / 도어락 API 다운 → 트레이너 원격 unlock / GPS 오차 → WiFi BSSID 보정 / 폰 분실 → 회원 비활성화.

브로제이 얼굴인식 대비 비용 1/5~1/10, PIPA 부담 1/10, 도용 방지 동등.

---

## 보완 2 — 센터 영업 상태 게이트 (휴무/긴급 차단)

**가능. 옵션 A 의 Edge Function 에 Layer 5 추가 (1d).**

```sql
gym_operating_hours    (gym_id, day_of_week, open_time, close_time, closed)
gym_special_closures   (gym_id, closure_date, reason, full_day, start_time, end_time)
gym_emergency_lockdown (gym_id, active, reason, expires_at)
```

| UI | 위치 | 효과 |
|---|---|---|
| 정기 영업시간 | SettingsTab | 요일별 시간 |
| 임시 휴무 | DashboardTab 캘린더 | 공휴일·휴가 사전 등록 |
| **긴급 잠금** | 대시보드 적색 1탭 버튼 | 즉시 전 회원 입장 차단 + 자동 만료 |

영업시간 변경 후 적용 딜레이 ~1시간은 실무상 허용 (즉각 반영 필요 이슈 드묾). CAPS 는 API spec 미확인 시 즉시 변경 불확실 → 자체 옵션 A 가 휴무/긴급 측면 우위.

---

## 보완 3 — CAPS 제휴 시나리오 (지문인식 출입제어 통합)

### 아키텍처 — "단순 이벤트 수신자" 포지셔닝 (책임 경감)

```
CAPS 단말기(지문) → CAPS 서버(생체정보 처리자) → webhook{member_id,time} → 오운 CRM(단순 수신자) → attendance
```

**핵심:** 오운은 생체정보(지문)에 절대 접근 X. 출입 이벤트만 수신 → PIPA 상 "수탁자" 아닌 단순 수신자.

### CAPS 가격 (조사)

| 항목 | 정보 |
|---|---|
| 월 기본료 (캡스홈) | 월 1만원대 (헬스장 특화 가격은 견적) |
| 설치비 | 렌탈 39,000원 / 판매 무료 |
| B2B API / webhook | 공식 미확인 — ADT캡스 1588-6400 문의 필요 |

### 법적 리스크 — 중간 (아키텍처 조건부 낮음)

| 시나리오 | 오운 지위 | 위험도 |
|---|---|---|
| 단순 이벤트 수신 (권장) | 데이터 수신자 | **낮음~중간** |
| 출입 이벤트 + 회원 매핑 위탁 | 수탁자 | 중간 |
| 생체정보 자체 접근 | 민감정보 처리자 | **높음** (회피) |

**필수 보호 조치:** 회원 동의서 명시 / 데이터 흐름 다이어그램 공개 / CAPS DPA 체결 / 변호사 자문 30-50만원 / "단순 수신자" 입증 로그 보관.

### CRM 가격 (Phase 3 정식 출시)

| 플랜 | 월 가격 | 기능 |
|---|---|---|
| Free | 0원 | 기본 회원 관리 ~20명 |
| **Pro** | **월 19,000~24,000원** | AI 일지·이탈예측·리포트·정산·crm_permissions |
| Pro + Community | 월 24,000~29,000원 | + Community·마켓플레이스 |
| CAPS 출입제어 add-on | +10,000~15,000원 | webhook 연동 |

헬스장 총 부담 월 40,000~70,000원 (바디코디 60k와 동등, AI 차별화).

---

## 보완 4 — 월 유지보수 비교 (CAPS vs 자체 A)

### 용어
- **본인 시간** = 매달 운영·유지보수 잡무 시간 (코딩 X). 장애 응대, 로그 점검, 영업시간 변경, 신규 등록 등.
- **시간 환산 (시급 5만)** = 기회비용 추정. 실제 지출 X.
- **실현금 손익** = 매출 - 실비용(인프라+변호사).

### 확장성 (본인 시간/월)

| 헬스장 수 | CAPS | 자체 A | 권장 |
|---|---|---|---|
| 1-5 | 3-5h | 5-8h | **자체 A** (초기 비용 ↓) |
| 6-15 | 4-6h | 8-15h | 자체 A 유지 OR CAPS 검토 |
| 16-30 | 5-8h | 15-25h | **CAPS 강권** |
| 30+ | 6-10h | 25-40h | **CAPS 필수** |

**전환 트리거:** 헬스장 ≥15 / 본인 월 ≥10h / 주 2건+ 장애 / 분기 2회+ 변호사.

---

## 보완 5 — CAPS 제휴 시 실질 순수익

### Referral Commission 정의
오운이 헬스장을 CAPS 에 소개한 대가로 CAPS 가 매월 지급하는 소개 수수료 (CAPS 매출의 N%, 표는 10% 가정). 시나리오 B(별도 청구)에만 적용. **ADT캡스 partner program 운영 여부 미확인.**

### 가정 (영업 미팅 전 추정 — ±30~50%)
헬스장→오운 50k / CAPS 도매가 20k / referral 10% / 인프라+자문 월 102,500 / 세금 간이과세.

### 시나리오 B (별도 청구 + Referral) — 권장 (회계·법적 부담 ↓)

| 헬스장 | 매출 | 비용+세금 | **월 순수익** | 연 순수익 |
|---|---|---|---|---|
| 5 | 157,500 | -104,300 | **53,200원** | 638,400원 |
| 10 | 315,000 | -115,500 | **199,500원** | 2,394,000원 |
| 20 | 630,000 | -134,500 | **495,500원** | 5,946,000원 |
| 50 | 1,575,000 | -410,000 | **1,165,000원** | 13,980,000원 |
| 100 | 3,150,000 | -995,000 | **2,155,000원** | 25,860,000원 |

### 시간 환산 손익분기 = N=15 헬스장 (시급 5만 기준)

| N | 매출 순수익 | 시간 환산 후 | 평가 |
|---|---|---|---|
| 5 | +53k | -10~20만 | 적자 (베타) |
| 10 | +200k | -10만~0 | break-even |
| **20** | +496k | **+15~25만** | 부수입 가능 |
| 50 | +1,165k | +55~75만 | 안정 |
| 100 | +2,155k | +110~160만 | 풀타임 가능 |

CAPS vs 자체 A 순수익 차이: N=20 시 +219k, N=50 시 +442k. N=20 부터 CAPS 명확한 우위.

---

## 보완 6 — 자작 IoT 스위치 + CRM 연동 장단점

### 전제: "IoT 스위치" ≠ "잠금장치"

| 구성 | 난이도 | 비용 | 누가 |
|---|---|---|---|
| IoT 스위치 (신호→접점) | 낮음 | ~2-3만원/대 | 자작 가능 |
| **잠금장치 (전기정/스트라이크)** | **높음** | 헬스장당 20-50만원 | 시공업체 |
| 시공 (전기·소방·피난) | **높음** | 위 포함 | 면허 업체 |

작은 PT 스튜디오 = 대개 수동 문 → 스위치 없음 → 잠금장치부터 신규 설치 필요.

### 단점 — 가장 큰 산 3개 (법·안전 영역)

| # | 문제 | 심각도 |
|---|---|---|
| C1 | **KC 전파인증(전파법)** — WiFi/BLE 상업 배포 의무, 자작도 예외 X. 미인증 = 위반. 모델당 수십~수백만원 + 1-3개월 | 🔴 P0 블로커 |
| C2 | **소방법/건축법** — 화재·정전 시 자동 해정(fail-safe) + 피난동선 의무 | 🔴 P0 |
| C3 | **제조물책임(PL법)** — 자작 기기 발화 시 "제조자"=오운 무한책임. 보험 필수 | 🔴 P0 |
| C4-7 | 출장 설치/AS, 펌웨어 디버깅, 신뢰성(영업 마비), 네트워크 의존 | 🟠~🟡 |

### 🎯 권고 — 자작 대신 "기성 KC인증 스마트 릴레이 + CRM 연동"

| 항목 | 자작 | 기성 릴레이 (Sonoff/Shelly/Tuya/SmartThings) |
|---|---|---|
| 비용 | ~2-3만원 | ~1-3만원 |
| KC 전파인증 | 오운 부담 (블로커) | **제조사 보유** ✅ |
| PL법 화재책임 | 오운 무한책임 | **제조사** ✅ |
| 펌웨어/OTA/안정성 | 오운 직접 | **제조사** ✅ |
| CRM 연동 | 자체 프로토콜 | 제조사 클라우드 API + 로컬 API(Shelly/Sonoff) |

오운 = "제조자" 아닌 "통합 개발자" → C1·C3 거의 소멸. 잠금장치·시공은 지역 출입통제 업체 제휴로 분산. 소방 fail-safe 는 잠금장치 타입 선택으로 충족.

**결론: "기성품 조합 + 시공 외주" 가 1인 개발자 현실적 정답.** 코드(CRM 연동)만 본인, 제조·인증·시공은 외부 분산.

---

## 최종 결론 — 전략 (2026-05-13 사용자 합의)

### 1. 개발 우선순위: **Community 우선 (CRM 보다 먼저)**

근거:
- 베타 30명 = 1인 강사 풀 → CRM(헬스장 대표/직원 대상) 사용자 거의 0
- Community 는 회원·강사 모두 대상 + 베타 모집 채널 가치 큼
- Community 배포 작업량 = RLS fix 만 (P0 1-2개) vs CRM = P0 다수

### 2. 출입제어: CAPS 제휴가 종합 우위 (선결 조건부)

종합 조건(유지보수·보안·CS·법적·확장성) 기준 CAPS 제휴 우위. 단 **ADT캡스 B2B 제휴 가능성 확인 필요** (가격/API/1인 가입/협상 기간 4개 모두 만족해야 성립). 미확인 시 자체 옵션 A(원-탭, 기성 스마트 릴레이) 로 fallback.

| 단계 | 시점 | 액션 |
|---|---|---|
| 1. 보류 | 베타 (지금) | 출입제어 X. Community RLS fix 만 |
| 2. ADT캡스 문의 | 정식 출시 직전 (N=3-5) | 1588-6400 → 4개 항목 확인 (분기점) |
| 3-A. 호응 시 | N=5-10 | 변호사+DPA+통합 출시 (CAPS 메인) |
| 3-B. 거절 시 | N=5-10 | 자체 옵션 A 출시 (기성 릴레이) |
| 4. 표준화 | N=15+ | CAPS 메인, 자체 A 저가형 잔존 |

### 3. 다음 세션 작업 (Community 우선 Phase 1)

```
1. 마이그 054 — community_* RLS strict (R1)
2. 마이그 055 — community_contacts RLS strict + RPC NULL 가드 (R4/R5)
3. CommunityPortal NULL 가드 (R4)
4. App.jsx /community 라우트 ComingSoon 해제 (검증 후)
```

이후 Phase 2 고도화: 갤러리 UX / 마켓플레이스 / 모더레이션 MVP(R8) / 1:1 메시지. 베타 데이터 기반 우선순위 결정. CRM 출입제어·CAPS 영업 문의는 정식 출시 단계(N=3-5)로 보류.

---

## Verification (검증 방법)

다음 세션 작업 후:
1. **R1/R5 fix:** `054_community_rls.sql` 적용 후 anon key 로 `select * from community_posts` → 0행/거부 확인
2. **ComingSoon 해제:** 로컬 dev ownapp.kr/community 갤러리 피드 정상 표시
3. **NULL 가드:** trainer_resolve_or_create NULL 반환 시 빈 상태 UI 표시
4. **Phase 2 시점:** 베타 30명 Community 사용량 metric / AI 이탈예측 false positive 비율 / PG 테스트 결제 성공률

## Critical Files (다음 세션 변경 대상)

- `supabase/migrations/054_community_rls.sql` (신규)
- `supabase/migrations/055_community_contacts_rls.sql` (신규, 또는 054 합침)
- `apps/portal/src/pages/CommunityPortal.jsx` (NULL 가드)
- `apps/portal/src/App.jsx` (Community 라우트 ComingSoon 해제)
