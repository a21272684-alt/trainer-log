# Member 앱 코드 리뷰 리포트

**대상:** `apps/portal/src/pages/MemberPortal.jsx` + 의존하는 `packages/shared/lib/*`, `apps/portal/src/lib/{exercises,routineTemplates}.js`
**작성일:** 2026-05-08
**범위:** Member 특화 항목. **공통 보안 (RLS 등) 은 [`code-review-trainer.md`](code-review-trainer.md) 참조.**

---

## 우선순위 한눈에 (Member 특화)

| 우선순위 | 카테고리 | ID | 제목 |
|---|---|---|---|
| **P0** | 🔒 보안 | (Trainer S-001/004 참조) | 회원 본인이 다른 회원의 건강·식단·운동 기록 anon key 로 read 가능 |
| **P0** | 💰 비용 | C-101 | 식단 AI 사진 인식이 `ai_usage` 추적 X — 무한 abuse 가능 |
| **P0** | 💰 비용 | C-102 | diet-photos / hold-photos 클라이언트 압축 X — 원본 그대로 storage 업로드 |
| P1 | 🐛 버그 | B-101 | FileReader `onerror` 핸들러 없음 — 파일 읽기 실패 silent |
| P1 | 🐛 버그 | B-102 | logs 로드 `.catch` 누락 |
| P1 | 🎨 UX | U-101 | 식단 로드 실패 silent (`console.warn` 만) |
| P1 | 🎨 UX | U-102 | 음식 추가 모달 모바일 미대응 (maxWidth 고정) |
| P2 | 🎨 UX | U-103 | 신규 회원 첫 진입 가이드 부재 |
| P2 | 🎨 UX | U-104 | 운동 기록 0건 / 식단 기록 0건 빈 상태 약함 |
| P2 | ⚡ 성능 | P-101 | WorkoutSession 의 muscles Set 매번 재생성 |

---

## 🔒 보안 (P0)

### Member 특화 — Trainer 리포트 S-001 의 영향
[`code-review-trainer.md`](code-review-trainer.md) 의 **S-001** (모든 테이블 RLS `using (true)`) 가 Member 측에는 다음 형태로 표출:

- **회원 A 가 본인의 health_records 만 보여야 하는데, anon key 로 다른 회원 데이터 read 가능**
- 자유게시판 (`member_posts`) 의 모든 글이 누구나 update/delete 가능
- 식단 사진 (`diet_logs`) 도 유출 가능 — 식단은 한국 개인정보보호법상 민감정보 (다이어트·질병 관리)

**fix:** Trainer 리포트의 PR 1번 (RLS 강화) 에 함께 처리.

### 추가 — `M-S1` 체크리스트 항목 검증 필요 🟡
- 사용자 체크리스트의 `M-S1` (URL 의 id 파라미터 변경 시 다른 회원 데이터 노출) 은 RLS 강화 후에도 별도 검증 필요. 앱 레벨에서 member_id 검증을 어디서 하는지 확인.

---

## 🐛 잠재 버그

### B-101 — FileReader `onerror` 핸들러 없음 🔴 확실 (P1)
- **위치:** `MemberPortal.jsx:457-496` (`recognizeFoodFromPhoto`)
- **코드:**
  ```js
  reader.onload = async (e) => {
    try { ... } catch (err) { showToast('인식 실패: ' + err.message); ... }
  }
  reader.readAsDataURL(file)
  ```
- **문제:** `reader.readAsDataURL` 자체가 실패 (파일 권한 거부 / 손상 파일 등) 하면 `onerror` 가 호출되는데 핸들러 없음 → silent fail + aiLoading state 영구 true.
- **fix:**
  ```js
  reader.onerror = () => {
    showToast('파일을 읽을 수 없어요')
    setFoodForm(p => ({ ...p, aiLoading: false }))
  }
  ```

### B-102 — logs 로드 `.catch` 누락 🔴 확실 (P1)
- **위치:** `MemberPortal.jsx:405-419`
- **코드:**
  ```js
  useEffect(() => {
    if (tab === 'logs' && member && memberLogs.length === 0) {
      supabase.from('logs')
        .then(({ data }) => { ... })
    }
  }, [tab, member])
  ```
- **문제:** `.then` 만 있고 `.catch` 없음 → unhandled promise rejection.
- **fix:** `.catch(e => console.warn('[logs]', e.message))` + UI 피드백 (toast)

### B-103 — `member.trainer_id` 가드 누락 🟡 검증필요 (P2)
- **위치:** `MemberPortal.jsx` 전반의 `member.trainer_id` 사용처
- **문제:** 신규 회원이 트레이너 미배정 상태일 때 trainer_id 의존 기능 (수업일지 발송 트레이너 표시 등) 이 어떻게 동작하는지 확인 필요.

---

## 💰 비용 (P0 ~ P1)

### C-101 — Gemini Vision 호출이 `ai_usage` 추적 X 🔴 확실 (P0)
- **위치:** `MemberPortal.jsx:469`
- **코드:**
  ```js
  const text = await callGeminiMultipart(trainerApiKey, GEMINI_MODEL, parts, { timeoutMs: 45000 })
  ```
- **문제:** 호출 후 `use_ai_credit` RPC 호출 X. `ai_usage` 테이블에 기록 X. Free 플랜 사용자가 한도 없이 무한 호출 가능.
- **abuse 시나리오:** 회원 1명이 음식 사진을 100번 업로드 → +$30/회원 (vision 단가 $0.30/회)
- **fix:**
  ```js
  // callGeminiMultipart 호출 후
  await supabase.rpc('use_ai_credit', {
    p_trainer_id: member.trainer_id,
    p_kind: 'food_vision',
  })
  ```
  → 한도 체크 + 차감.

### C-102 — diet-photos / hold-photos 클라이언트 압축 X 🔴 확실 (P0)
- **위치:** `MemberPortal.jsx:543` (식단 사진 업로드)
- **문제:** Trainer 의 운동 사진은 Canvas 압축 (max 1200px, WebP 0.80) 적용되지만, **Member 의 식단 사진과 hold 사진은 원본 그대로** Supabase storage 업로드.
- **abuse 시나리오:** iPhone 12MP 사진 = 5~8MB. 회원 600명 × 일 3끼 × 평균 6MB = 33GB/월 신규.
- **fix:** Trainer 의 압축 함수 (예: `compressImage(file, maxW=1200, quality=0.8)`) 를 packages/shared 로 추출 + Member 업로드 코드에서도 사용.

### C-103 — 운동 기록 영상 첨부 (M-W4) 비용
- **위치:** Member 의 자체 운동 세션에 영상 첨부 가능 — Trainer 의 session-media 와 동일 버킷
- **문제:** Trainer 리포트 C-001 (영상 길이 제한 없음) 동일하게 적용.
- **fix:** Trainer 리포트 C-001 fix 와 동시 처리.

---

## 🎨 UX 사각지대 (Member 특화)

### U-101 — 식단 로드 실패 silent 🔴 확실 (P1)
- **위치:** `MemberPortal.jsx:446-448`
- **코드:**
  ```js
  if (error) { console.warn('[loadDietLogs]', error.message); return }
  ```
- **문제:** 사용자는 "식단 0건" 으로 오인 → 재시도 못 함.
- **fix:** `showToast('식단을 불러오지 못했어요. 새로고침해주세요')` 추가.

### U-102 — 음식 추가 모달 모바일 미대응 🟡 검증필요 (P1)
- **위치:** `MemberPortal.jsx:2145` 부근 (FoodModal 또는 유사)
- **문제:** maxWidth 고정 — 모바일 (375px) 에서 키보드 올라오면 입력 필드 가려질 수 있음. 식단은 회원이 매일 모바일로 입력하는 가장 빈도 높은 기능.
- **fix:** `maxWidth: 'min(520px, 90vw)'` + `maxHeight: '90vh'` + 입력 필드 focus 시 scrollIntoView

### U-103 — 신규 회원 첫 진입 가이드 부재 🔴 확실 (P2)
- **위치:** `MemberPortal.jsx` 의 초기 진입
- **시나리오:** 회원이 첫 로그인 → 수업일지 탭 → "📋 아직 기록이 없어요" 텍스트만
- **fix:** 첫 진입 시 가이드 모달 — "트레이너에게 수업을 받으면 일지가 여기 표시돼요. 그 동안 직접 운동·건강·식단 기록을 시작해보세요."

### U-104 — 운동·식단 0건 빈 상태 약함 🔴 확실 (P2)
- **위치:** Workout / Diet 탭의 0건 상태
- **fix:** 큰 이모지 + 1줄 가이드 + "첫 기록 시작하기" CTA 버튼

### U-105 — 음식 인식 실패 시 재시도 안내 🟡 검증필요 (P2)
- **위치:** `MemberPortal.jsx:457-496` (catch 블록)
- **현재:** `showToast('인식 실패: ' + err.message)` — 기술적 메시지
- **fix:** "음식이 잘 안 보여요. 다시 찍거나 직접 입력해주세요" + 직접 입력 모드로 전환 버튼

---

## ⚡ 성능 (Member 특화)

### P-101 — WorkoutSession 의 muscles Set 매번 재생성 🔴 확실 (P2)
- **위치:** `MemberPortal.jsx:2367`
- **코드:**
  ```js
  const muscles = [...new Set(exList.map(e => e.muscle_group).filter(Boolean))]
  ```
- **문제:** 운동 카드 1개당 Set 새로 생성. 운동 20개 펼치면 20번 반복.
- **fix:** `<WorkoutSessionCard memo>` 컴포넌트로 추출 + `useMemo(() => ..., [exList])`

### P-102 — Chart.js 차트 렌더 비용 🟡 검증필요 (P2)
- **위치:** 건강 탭의 체중·수면 차트
- **문제 후보:** 3개월 데이터 (90 데이터 포인트) 차트가 매 탭 진입 시 새로 렌더. 단, Chart.js 자체가 빠른 라이브러리라 큰 문제 아닐 수 있음.
- **검증 방법:** 사용자 체크리스트 `M-P3` (차트 렌더링 < 1초) 결과로 결정.

---

## 권장 작업 순서

Member 특화 PR 들도 Trainer 리포트의 권장 순서에 맞춰 함께 처리:

| 순번 | PR | Member 측 포함 |
|---|---|---|
| 1 | 보안 RLS 강화 | (Trainer S-001 과 함께 — 모든 테이블 적용) |
| 2 | 출시 블로커 P0 | C-101 (AI 한도), C-102 (이미지 압축) |
| 3 | P1 묶음 | B-101/102, U-101/102 |
| 4 | (Trainer 분해 시리즈와 별도) | — |
| 5 | (동일) | — |
| 6 | 잔여 P2 | B-103, U-103/104/105, P-101 |

---

## 다음 단계

1. Trainer 리포트와 함께 우선순위 합산 → P0 fix PR 시작
2. 사용자 체크리스트 fail 결과 종합해서 리포트와 맞춰보기 (특히 M-S1, M-S2, M-D2)
3. C-101 (AI 한도) + C-102 (압축) 은 베타 출시 전 반드시 — 비용 폭발 방지
