# Trainer 앱 코드 리뷰 리포트

**대상:** `apps/portal/src/pages/TrainerApp.jsx` + 의존하는 `packages/shared/lib/*`, `apps/portal/src/lib/*`, `apps/portal/src/components/ScheduleModal.jsx`, `supabase/migrations/*`
**작성일:** 2026-05-08
**방법:** 5축 (잠재 버그 / 보안 / 성능 / 비용 / UX) 병렬 분석 → critical 발견은 직접 코드/SQL 검증
**범위:** **Trainer 앱 + 공통 인프라**. Member 특화 항목은 [`code-review-member.md`](code-review-member.md) 참조.

> **확신도 표기**
> - 🔴 **확실** — 코드/SQL 에 명시적으로 보임, fix 권장
> - 🟡 **검증필요** — 추가 검증 후 처리 결정
> - ❌ false positive 로 판명된 항목은 본 리포트에 포함하지 않음

---

## 우선순위 한눈에

| 우선순위 | 카테고리 | ID | 제목 | 영향 |
|---|---|---|---|---|
| **P0** | 🔒 보안 | S-001 | 38+ 테이블의 RLS 가 `using (true)` — 누구나 read/write | **출시 절대 불가** 수준 |
| **P0** | 🔒 보안 | S-005 | payments 도 `using (true)` — 다른 트레이너 매출 삭제 가능 | 사업 신뢰성 붕괴 |
| **P0** | 🔒 보안 | S-004 | 건강·식단 민감정보 평문 + 무방비 | 개인정보보호법 위반 가능 |
| **P0** | 🐛 버그 | B-001 | `push.js` 의 block 가드 누락 → 앱 크래시 가능 | 알림 기능 사용 시 |
| **P0** | 💰 비용 | C-001 | 영상 길이/크기 제한 없음 | 1트레이너 abuse 시 +$168/월 |
| **P0** | 🎨 UX | U-014 | 시간표 블록 삭제 confirm 없음 | 실수 클릭으로 일정 손실 |
| P1 | 🎨 UX | U-005 | fetch 실패 시 silent fail (toast 없음) | 사용자 혼동 |
| P1 | 🐛 버그 | B-003 | `mem?.name[0]` — 옵셔널 체이닝 부분 적용 | 결제 카드 렌더 시 |
| P1 | 🐛 버그 | B-006/007 | async 에러 무시 (`.catch(() => {})`) | silent failure |
| P1 | ⚡ 성능 | P-001 | 매출 탭 N+1 lookup (members.find × logs) | 회원 50명+ 시 lag |
| P1 | ⚡ 성능 | P-002 | 회원 목록 정렬·필터 매번 재계산 | 검색마다 lag |
| P1 | 💰 비용 | C-002 | 회원 삭제 시 storage 파일 orphan | 누적 GB 단위 낭비 |
| P1 | 💰 비용 | C-003 | Gemini Vision 호출이 `ai_usage` 추적 X | abuse 시 +$45/월 |
| P2 | 🐛 버그 | B-009 | 트리머 모달의 setTimeout cleanup 누락 | 트리머 빠르게 닫을 시 |
| P2 | 🐛 버그 | B-010 | notification interval deps 에 blocks/members 포함 | 잦은 재설정 |
| P2 | 🎨 UX | U-001 | 회원 0명 빈 상태 안내 약함 | 신규 트레이너 이탈 |
| P2 | 🎨 UX | U-020 | ScheduleModal 모바일 미대응 | 모바일 입력 어려움 |
| P2 | ⚡ 성능 | P-003~005 | 정산/결제/운동 컴포넌트 분해 후보 | ScheduleModal 패턴으로 |

---

## 🔒 보안 (P0 — 가장 critical)

### S-001 — RLS bypass: 거의 모든 테이블이 `using (true)` 🔴 확실

- **위치:** `supabase/migrations/{001,002,003,004,006,011~024,026, ...}_*.sql` — 18개 마이그레이션
- **검증:** `grep -lE "using \(true\)" supabase/migrations/*.sql` → 18개. `auth.uid()` 사용 정책은 단 4개.
- **샘플 코드** (`001_init.sql`):
  ```sql
  create policy "trainers_read"   on trainers for select using (true);
  create policy "members_read"    on members  for select using (true);
  create policy "logs_read"       on logs     for select using (true);
  create policy "health_read"     on health_records for select using (true);
  ```
- **문제:** anon key 만 알면 누구나 모든 트레이너의 회원·일지·건강기록·결제·식단 정보를 read/insert/update/delete 가능. 클라이언트 앱은 `eq('trainer_id', trainer.id)` 로 필터링하지만, 악의적 사용자가 DevTools 콘솔에서 `supabase.from('members').select('*')` 만 실행하면 **다른 트레이너의 모든 회원 데이터가 노출**.
- **영향:**
  - 개인정보 대량 유출 (체중·건강·식단·결제) → 개인정보보호법 위반
  - 결제 기록 위변조·삭제로 매출 부정 가능
  - 멀티 테넌트 격리 완전 실패
- **권장 fix:** 출시 전 반드시. 트레이너/회원이 phone auth (Supabase Auth 미사용) 라서 `auth.uid()` 가 NULL → RLS 정책 작성 시 다음 두 옵션 중 선택 필요:
  - **옵션 A — Supabase Auth 로 마이그레이션**: 핸드폰 OTP 도입. 표준 `auth.uid()` 사용. 큰 변경.
  - **옵션 B — RPC 게이트웨이 패턴**: 모든 변경/조회를 SECURITY DEFINER RPC 경유. RPC 안에서 trainer_id 검증. RLS 는 anon 의 직접 select 차단 (`using (false)`). 코드량 많음.
  - **옵션 C — JWT custom claim**: 로그인 시 trainer_id 를 JWT 에 박아 발급, RLS 가 `auth.jwt() ->> 'trainer_id'` 검증. Supabase Edge Function 필요.
- **결정 필요 (출시 진입 직전):** 어느 옵션? 내 추천 = **옵션 B** (가장 적은 외부 변경 + 점진 가능). 다음 작업으로 plan 잡기.

### S-005 — `payments` 테이블도 `using (true)` 🔴 확실
- **위치:** `supabase/migrations/006_attendance_products_payments.sql` 의 payments 정책
- **코드:**
  ```sql
  create policy "payments_delete" on payments for delete using (true);
  ```
- **문제:** anon key 로 다른 트레이너의 결제 기록 delete 가능. UI 의 "owner/manager 만 환불" 권한 검증은 클라이언트에만 있고, DB 레이어에선 누구나 가능.
- **영향:** 매출 부정·조작 가능. 사업 신뢰성 붕괴.
- **권장 fix:** S-001 의 RLS 강화 작업에 포함.

### S-004 — 건강·식단 민감정보 평문 + RLS 무방비 🔴 확실
- **위치:** `supabase/migrations/003_health_weight_profile.sql`, `028_diet_logs.sql`
- **문제:** 체중·수면·식단은 한국 개인정보보호법상 **민감정보**. 현재:
  - 평문 저장 (암호화 X)
  - RLS 가 `using (true)` 라 누구나 read 가능
- **영향:** 데이터 유출 시 회원 신원 + 건강상태 동시 노출. 법적 책임 큼.
- **권장 fix:**
  - 단기 (출시 직전): S-001 의 RLS 강화로 격리. 평문 저장은 베타 단계엔 허용 (단 약관에 "민감정보 처리" 동의 명시).
  - 장기: pgcrypto 또는 client-side encryption 검토.

### S-003 — `app_settings` 의 RLS 약함 🟡 검증필요
- **위치:** `app_settings` 테이블의 RLS (마이그레이션 직접 확인 필요)
- **문제:** 환불정책·플랜 가격 같은 게 `app_settings` 에 들어있는데 누구나 update 가능하면 위조된 환불정책이 표시될 수 있음.
- **권장 fix:** `app_settings` 의 update/insert/delete 는 admin 만 (RPC `app_settings_admin_upsert` 가 이미 있음 → RLS 에서 직접 update 차단).

### S-002 — Admin token 빌드 노출 ✅ 검증 결과 OK
- **검증:** `grep -rE "VITE_ADMIN_*" apps/portal apps/crm packages/shared` → 결과 없음
- **결론:** Admin token 은 admin 빌드에만 들어감 (monorepo 분리의 보안 이점이 정상 동작). 추가 작업 없음.

---

## 🐛 잠재 버그

### B-001 — `push.js` block 가드 누락 🔴 확실 (P0)
- **위치:** `apps/portal/src/lib/push.js:28-31`
- **코드:**
  ```js
  const [h, m] = block.start.split(':').map(Number)
  const scheduledAt = new Date(block.date)
  scheduledAt.setHours(h, m - notifMinutes, 0, 0)
  ```
- **문제:** `block.start` 또는 `block.date` 가 undefined 면 `.split` TypeError → 앱 크래시.
- **fix:** 함수 진입 시 `if (!block?.start || !block?.date) return`

### B-003 — `mem?.name[0]` 옵셔널 체이닝 부분 적용 🔴 확실 (P1)
- **위치:** `TrainerApp.jsx:46` (RevenuePaymentList)
- **코드:** `<div>{mem?.name[0]||'?'}</div>`
- **문제:** `mem` 이 null 이면 `mem?.name` = undefined → `undefined[0]` → TypeError.
- **fix:** `{mem?.name?.[0] ?? '?'}`

### B-004 — `.then` 만 있고 `.catch` 누락 (logs 로드) 🔴 확실 (P1)
- **위치:** `MemberPortal.jsx:405-419` (member 리포트에서도 다룸)
- **위치 추가:** `TrainerApp.jsx:2336-2343` (gym lookup)
- **fix:** 모든 supabase `.then` 에 `.catch(e => console.warn('[ctx]', e.message))` 추가

### B-006 — `app_settings` 로드 실패 silent 🔴 확실 (P1)
- **위치:** `TrainerApp.jsx:1917-1927`
- **코드:** `.catch(() => {})`
- **문제:** Gemini API 키, 긴급 안내 URL 같은 핵심 설정 로드 실패해도 알 수 없음. 나중에 AI 호출 시 "서비스 준비 중" 으로만 표시.
- **fix:** `.catch(e => console.warn('[app_settings]', e.message))`

### B-007 — FileReader 에러 미처리 🔴 확실 (P1)
- **위치:** `MemberPortal.jsx:457-496` (Member 리포트 메인)
- **요약:** `reader.readAsDataURL` 의 비동기 실패가 바깥 try/catch 에 안 잡힘.
- **fix:** `reader.onerror` 핸들러 추가

### B-008 — `revenue` useEffect 의 race + cancelled 🟡 검증필요 (P2)
- **위치:** `TrainerApp.jsx:2310-2331`
- **현재:** `cancelled` flag 있으나 catch 블록에서 cancelled 체크 안 함. 실제 setState 는 cancelled 체크 후 호출되니 메모리 누수만 가능성.
- **fix:** `catch (e) { if (!cancelled) console.warn(...) }`

### B-009 — 트리머 모달 setTimeout cleanup 누락 🔴 확실 (P2)
- **위치:** `TrainerApp.jsx:2779-2804`
- **코드:** `setTimeout(() => { video.pause(); recorder.stop() }, durationMs + 300)` — id 저장 X
- **문제:** 트리머 닫은 직후 timeout 이 실행되면 unmounted DOM 접근 가능.
- **fix:** id 저장 + cleanup 함수에서 clearTimeout

### B-010 — notification interval deps 에 blocks/members 포함 🔴 확실 (P2)
- **위치:** `TrainerApp.jsx:1779-1814`
- **코드:** `useEffect(() => { setInterval(...) }, [notifEnabled, notifMinutes, blocks, members])`
- **문제:** blocks 변경 (사용자가 수업 추가) 마다 interval 재설정. 30초 주기인데 거의 매분 재설정.
- **fix:** deps 를 `[notifEnabled, notifMinutes]` 로 제한 + 클로저 안에서 ref 로 최신 blocks/members 참조

### B-011 — `handleSaveBlock` 알림 실패 시 롤백 안 함 🔴 확실 (P2)
- **위치:** `TrainerApp.jsx:3352-3358`
- **문제:** optimistic update 후 `scheduleNotification` 실패해도 blocks 그대로. UI 에 일정은 보이는데 알림은 X 인 불일치.
- **fix:** `try { await scheduleNotification(...) } catch (e) { setBlocks(prev => prev.filter(b => b.id !== id)); showToast('알림 예약 실패. 일정 취소됨.') }` — 또는 알림 실패는 그냥 toast 만 (정책 결정)

---

## ⚡ 성능 (분해 후보 — ScheduleModal 패턴으로 진행)

### P-001 — 매출 탭 N+1 lookup 🔴 확실 (P1)
- **위치:** `TrainerApp.jsx:3499-3500`
- **코드:**
  ```js
  const weekRevenue = weekLogs.reduce((s,l) => {
    const m = members.find(x => x.id === l.member_id)  // ← 매번 선형 검색
    return s + (m?.session_price || 0)
  }, 0)
  ```
- **영향:** 회원 50명 × 로그 200건 = 10,000회 비교 / 매 render
- **fix:** `useMemo(() => new Map(members.map(m => [m.id, m])), [members])` 후 `memberMap.get(l.member_id)`

### P-002 — 회원 목록 정렬·필터 매번 재계산 🔴 확실 (P1)
- **위치:** `TrainerApp.jsx:4210-4595` (386줄 영역)
- **fix:** 정렬/필터 결과 useMemo + 카드 컴포넌트 분리 (`<MemberCard memo>`)

### P-003 ~ P-005 — 다음 분해 후보 🔴 확실 (P2)
| ID | 영역 | 위치 | ROI |
|---|---|---|---|
| P-003 | WorkoutSessionCard | `TrainerApp.jsx:5500-5560` | 중 |
| P-004 | PaymentModal | `TrainerApp.jsx:6060-6320` | 중 |
| P-005 | SettlementBreakdown | `TrainerApp.jsx:377-1125` (748줄) | **상** |

각각 ScheduleModal 패턴 (별도 컴포넌트 + 자체 state + React.memo + useCallback) 으로 추출. PR 1개씩.

### P-101 ~ P-105 — useMemo 작은 fix들
- 각 hot path 에 useMemo. 분해 안 해도 즉시 적용 가능. P-001/P-002 의 fix 와 함께 묶어 한 PR.

### P-301 — 회원 목록 페이지네이션 부재 🔴 확실 (P2)
- 회원 200명+ 일 때 한 번에 다 렌더 → 정렬·필터마다 리플로우.
- fix: 초기 20명 + 무한 스크롤 또는 pagination

---

## 💰 비용

### C-001 — 영상 길이/크기 제한 없음 🔴 확실 (P0)
- **위치:** `TrainerApp.jsx:2773-2808` (MediaRecorder 설정)
- **코드:** `videoBitsPerSecond: 2000000` 만 설정. **녹화 시간 제한 X.**
- **abuse 시나리오:** 트레이너 1명 × 매일 30분 영상 = 281GB/월 → +$168/월 (Pro tier 초과분)
- **fix:**
  - MediaRecorder 시작 시 `setTimeout(() => recorder.stop(), 30 * 60 * 1000)` 으로 30분 강제 stop
  - 비트레이트 1Mbps 로 절감 (720p 화질 충분)
  - 업로드 전 file.size 체크 (예: 200MB 초과 시 차단)

### C-002 — 회원 삭제 시 storage orphan 🔴 확실 (P1)
- **위치:** `TrainerApp.jsx:2666-2674` (deleteMember)
- **문제:** members 행 delete + cascade 로 logs/payments/health_records/diet_logs 삭제. 그러나 storage 의 사진/영상은 **자동 삭제 X**.
- **누적:** 6개월 후 탈퇴 회원 60명 × 사진 10장 × 3MB = 1.8GB orphan
- **fix:**
  - DB 삭제 전 `supabase.storage.from('session-media').list(...)` 로 파일 목록 → `remove()` 일괄
  - 또는 Supabase scheduled function 으로 매일 야간에 orphan 청소

### C-003 — Gemini Vision 호출이 `ai_usage` 추적 X 🔴 확실 (P1)
- **위치:** `MemberPortal.jsx:469` (식단 사진 인식, Member 리포트 메인)
- **문제:** `callGeminiMultipart` 호출 후 `use_ai_credit()` RPC 호출 X. 무한 abuse 가능.
- **fix:** 호출 후 `await supabase.rpc('use_ai_credit', { p_trainer_id, p_kind: 'food_vision' })`

### C-004 — 페이지 진입 시 1500 ops 🟡 검증필요 (P2)
- **위치:** `TrainerApp.jsx:2091-2096`
- **코드:** logs/health/attend 각 500건씩 fetch
- **현재:** Pro tier 의 read 무제한이라 직접 비용 X. **하지만 egress 는 영향**. 한 번에 다 fetch 대신 탭별 lazy load 권장 (회원 탭 진입 시만 risk score 계산용).

---

## 🎨 UX 사각지대

### U-014 — 시간표 블록 삭제 confirm 없음 🔴 확실 (P0)
- **위치:** `apps/portal/src/components/ScheduleModal.jsx:151-155`, `TrainerApp.jsx:3370-3373` (handleDeleteBlock)
- **문제:** 삭제 버튼 클릭 즉시 삭제 + Web Push 알림도 함께 사라짐. 실수 회복 불가.
- **fix:**
  ```js
  const handleDeleteBlock = useCallback(async (id) => {
    if (!window.confirm('정말 삭제할까요? 복구 불가능합니다.')) return
    setBlocks(prev => prev.filter(b => b.id !== id))
    // ...
  }, [])
  ```

### U-005 — fetch 실패 silent (loadMembers 등) 🔴 확실 (P1)
- **위치:** `TrainerApp.jsx:2076-2081`
- **문제:** 네트워크 실패 시 `setMembers(data || [])` 로 빈 배열 처리 → 사용자가 "회원 0명" 으로 오인.
- **fix:** try/catch + error state + retry 버튼. 또는 `useToast()` 로 "데이터 로드 실패" 표시.

### U-008 — 식단 로드 실패 silent (Member 리포트 메인)

### U-011 — 스케줄 저장 중 버튼 disabled X 🔴 확실 (P1)
- **위치:** `ScheduleModal.jsx` 의 저장 버튼
- **fix:** `<button disabled={saving} onClick={handleSave}>저장 중...</button>`

### U-001 — 회원 0명 빈 상태 안내 약함 🔴 확실 (P2)
- **위치:** `TrainerApp.jsx:4532` 부근
- **현재:** "아직 회원이 없어요" 단순 텍스트
- **fix:** 큰 이모지 + "첫 회원 추가하기" CTA 버튼 + 30초 가이드 (선택)

### U-020 — ScheduleModal 모바일 미대응 🔴 확실 (P2)
- **위치:** `ScheduleModal.jsx:85` `maxWidth="360px"`
- **문제:** 360px 모바일에서 좌우 패딩 거의 없음. 키보드 올라오면 입력 필드 가려질 수 있음.
- **fix:** `maxWidth="min(360px, 90vw)"` + `maxHeight: '90vh'` + `overflow-y: auto`

### U-023 — 신규 트레이너 온보딩 부재 🔴 확실 (P2)
- **위치:** TrainerApp 의 첫 진입 화면
- **fix:** 첫 로그인 시 3단계 가이드 모달 (회원 추가 → 일정 추가 → 일지 작성)

---

## 권장 작업 순서 (PR 단위)

| 순번 | PR 제목 | 포함 | 추정 시간 |
|---|---|---|---|
| 1 | **fix: 보안 critical** — RLS 강화 (S-001/004/005) | 옵션 결정 후 마이그레이션 + RPC 게이트웨이 작성 | 1~3일 (옵션 B 기준) |
| 2 | **fix: 출시 블로커 P0 버그·UX·비용** | B-001, U-014, C-001, C-002 | 4시간 |
| 3 | **fix: P1 묶음** | B-003/006/007, U-005/008/011, C-003 | 4시간 |
| 4 | **perf: 매출 탭 + 회원 목록 분해** | P-001/002/101 | 4시간 |
| 5 | **perf: 정산/결제/운동 분해** | P-003/004/005 | 6시간 |
| 6 | **fix: 잔여 P2** | B-008/009/010/011, U-001/020/023, P-301 | 6시간 |

PR 1번 (보안 RLS) 은 별도 plan 이 필요 — 시작 전 사용자 결정 (옵션 A/B/C) 필수.

---

## 다음 단계

1. 이 리포트 + [`code-review-member.md`](code-review-member.md) + 사용자 체크리스트 결과 종합
2. P0 6개 우선 fix → 검증
3. PR 1번 (RLS) 의 옵션 결정 후 별도 plan 작업
