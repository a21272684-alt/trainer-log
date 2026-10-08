# 오운 iOS 앱 빌드 가이드 (Capacitor)

ownapp.kr 웹앱을 **Capacitor 네이티브 셸**로 감싸 App Store 에 올리기 위한 문서.
안드로이드(TWA)와 마찬가지로 앱은 **ownapp.kr 라이브 사이트를 로드**하므로,
웹 배포(git push → Vercel)가 iOS 앱에도 자동 반영된다. 재빌드·재심사는 네이티브
껍데기(아이콘·권한·플러그인)를 바꿀 때만 필요하다.

> iOS 빌드는 **Mac + Xcode 에서만** 가능하다(애플 규칙). 아래 "A. Mac 작업"은
> Mac 에서, "B. 회원(오운 운영자) 설정"은 회원님 PC/대시보드에서 진행한다.

---

## 핵심 값 (고정)

| 항목 | 값 |
|---|---|
| iOS Bundle ID | `kr.ownapp.app` (안드로이드 `kr.ownapp.twa` 와 별개) |
| 앱 표시 이름 | 오운 |
| 로드 URL | https://ownapp.kr |
| OAuth 딥링크(복귀 주소) | `kr.ownapp.app://oauth-callback` |
| 최소 iOS | 14.0+ (Capacitor 8 기준) |

---

## A. Mac 작업 (친구 Mac / Xcode)

### A-0. 사전 준비 (미리 받아두면 좋음 — 다운로드가 오래 걸림)
1. **Xcode** — Mac App Store 에서 설치(수 GB). 설치 후 1회 실행해 라이선스 동의.
2. **Command Line Tools** — 터미널: `xcode-select --install`
3. **Node.js 18+** — https://nodejs.org (LTS). 확인: `node -v`
4. **CocoaPods** — 터미널: `sudo gem install cocoapods` (또는 `brew install cocoapods`)
5. **Git** — 보통 Xcode Command Line Tools 에 포함. 확인: `git --version`
   (없으면 위 `xcode-select --install` 로 설치되거나 `brew install git`)

### A-1. 소스 체크아웃
```bash
# (비공개 저장소라 접근 권한 필요 — 아래 "저장소 접근" 참고)
git clone https://github.com/a21272684-alt/trainer-log.git
cd trainer-log
npm install
```

### A-2. 웹 빌드 (placeholder — 앱은 라이브 사이트를 로드하므로 내용은 사용 안 됨)
```bash
npm run build -w apps/portal
```
> `.env` 없이도 빌드된다(앱 런타임은 ownapp.kr 라이브를 로드). 만약 빌드가 환경변수로
> 멈추면 `apps/portal/.env` 에 공개값 2개만 넣는다:
> `VITE_SUPABASE_URL=...` / `VITE_SUPABASE_ANON_KEY=...` (둘 다 공개 클라이언트 값).

### A-3. iOS 네이티브 프로젝트 생성 + 동기화
```bash
cd apps/portal
npx cap add ios      # ios/ 네이티브 프로젝트 생성 (Mac 전용, CocoaPods 필요)
npx cap sync ios     # 웹 자산 + 플러그인 동기화
npx cap open ios     # Xcode 열기
```
> `appName` 이 한글("오운")이라 `cap add ios` 가 멈추면, `capacitor.config.json` 의
> `appName` 을 `Ownapp` 으로 바꿔 다시 실행하고, 표시 이름은 아래 A-5 에서 오운으로 지정한다.

### A-4. OAuth 딥링크용 URL 스킴 등록 (★ 로그인 필수)
Xcode → 좌측 `App` 타겟 → **Info** 탭 → **URL Types** → `+`
- **Identifier**: `kr.ownapp.app`
- **URL Schemes**: `kr.ownapp.app`

> 이게 없으면 구글/카카오 로그인 후 앱으로 복귀가 안 된다.

### A-5. 서명 + 표시 이름 + 권한 문구
Xcode → `App` 타겟 → **General / Signing & Capabilities**
- **Bundle Identifier**: `kr.ownapp.app`
- **Display Name**: 오운
- **Team**: 오운 Apple Developer 팀 선택 (→ "저장소 접근 / 애플 계정" 참고)
- **Signing**: Automatically manage signing 체크
- **Capability 추가 (★Apple 로그인 필수)**: **Signing & Capabilities** 탭 → **`+ Capability`** →
  **Sign in with Apple** 추가. (자동 서명이라 App ID 에도 자동 등록됨)

**Info.plist 권한 문구**(사진/카메라/마이크 기능 대비 — 심사 통과 위해 한글 설명 권장):
- `NSPhotoLibraryUsageDescription` = 식단·운동 사진을 첨부하기 위해 사진 보관함에 접근합니다.
- `NSCameraUsageDescription` = 식단·운동 사진을 촬영하기 위해 카메라를 사용합니다.
- `NSMicrophoneUsageDescription` = 음성 입력(수업일지 받아쓰기)에 마이크를 사용합니다.

### A-6. 실기기 테스트 (업로드 전 반드시)
Mac 에 아이폰 연결 → Xcode 상단 기기 선택 → ▶ Run →
1. **구글 로그인** 정상 → 앱 복귀 → 세션 유지 확인
2. **카카오 로그인** 정상 (현재 웹에서 비활성 상태면 건너뜀)
3. 사진 첨부 / 주요 화면 동작 확인

### A-7. 아카이브 + App Store 업로드
Xcode 상단 기기 = **Any iOS Device (arm64)** → 메뉴 **Product → Archive** →
Organizer 창 → **Distribute App → App Store Connect → Upload**.

---

## B. 회원(오운 운영자) 설정

### B-1. Supabase 대시보드 — 딥링크 리다이렉트 허용 (★ 로그인 필수)
Supabase → **Authentication → URL Configuration → Redirect URLs** 에 추가:
```
kr.ownapp.app://oauth-callback
```
> 이게 없으면 Supabase 가 딥링크로 돌려보내지 않아 로그인이 실패한다.
> 카카오 개발자 콘솔은 이미 Supabase 콜백을 가리키므로 **추가 변경 불필요**(웹 OAuth 기준).

### B-1b. Supabase — Apple provider 활성화 (★Apple 로그인 필수)
Supabase → **Authentication → Sign In / Providers → Apple** → **Enable** →
**Authorized Client IDs** 에 Bundle ID 추가:
```
kr.ownapp.app
```
> 네이티브 Sign in with Apple 은 앱이 Bundle ID 로 서명된 토큰을 주고 Supabase 가
> 이 Client ID 목록과 대조한다. **네이티브 전용이라 Services ID/.p8 Secret 은 불필요.**
> (웹 브라우저에서도 Apple 로그인을 켜려면 그때 Services ID + Secret 이 추가로 필요하지만,
> 현재 Apple 버튼은 iOS 앱에서만 노출하므로 생략.)

### B-2. Apple Developer / App Store Connect
1. **App ID 등록**: developer.apple.com → Certificates, Identifiers & Profiles →
   Identifiers → `+` → App → Bundle ID `kr.ownapp.app` (Explicit).
   (Xcode 자동 서명을 쓰면 A-5 에서 자동 생성되기도 함)
2. **앱 생성**: App Store Connect → 앱 → `+` → 플랫폼 iOS, 이름 "오운",
   Bundle ID `kr.ownapp.app` 선택.
3. **스토어 정보**: 설명/스크린샷/개인정보 URL(ownapp.kr/privacy)/
   계정삭제 URL(ownapp.kr/account-deletion)/연령등급/카테고리(건강·피트니스) 입력.
   (안드로이드 제출 때 쓴 자산 재사용 가능)
4. A-7 로 올라온 빌드 선택 → **심사 제출**.

---

## 저장소 접근 / 애플 계정 (친구 Mac 에서 필요한 권한)

- **저장소(비공개)**: 친구가 clone 하려면 접근 권한이 필요하다. 가장 안전한 방법 —
  GitHub → 저장소 → Settings → Collaborators 에 **친구 GitHub 계정을 초대**
  (또는 Personal Access Token 발급해 전달). 작업 끝나면 권한 해제.
- **애플 서명**: 친구 Xcode 가 빌드·업로드하려면 오운 Apple Developer 팀 접근 필요.
  App Store Connect → 사용자 및 액세스 → 친구 Apple ID 를 **App Manager** 로 초대하면
  자격증명 공유 없이 서명·업로드 가능. (끝나면 제거)

---

## ⚠️ 알아둘 점

1. **애플 심사 4.2(최소 기능)**: 애플은 "웹을 감싼 앱"을 엄격히 본다. 오운은 로그인·
   데이터가 많은 실제 앱이라 통과 가능성이 있지만, 반려 시 **네이티브 푸시 알림
   (@capacitor/push-notifications)** 등 네이티브 기능을 1개 추가하면 통과율이 크게 오른다.
   → 1차는 현 구성으로 제출, 반려되면 그때 보강.
2. **로그인 구조**: 네이티브에서는 구글/카카오 로그인이 **시스템 브라우저**로 열리고
   `kr.ownapp.app://oauth-callback` 딥링크로 복귀한다(코드: `apps/portal/src/lib/nativeAuth.js`).
   웹에서는 기존 방식 그대로라 영향 없음.
3. **업데이트**: 기능/UI/버그(웹) = git push → Vercel → 앱 자동반영(재심사 X).
   아이콘/권한/플러그인(네이티브) 변경만 Xcode 재빌드 + 재제출.
4. **일부 웹 전용 기능**(FFmpeg.wasm 영상처리, Web Speech 받아쓰기)은 iOS WKWebView
   에서 제약이 있을 수 있음 → 실기기 테스트에서 확인하고, 필요 시 네이티브 플러그인으로 대체.
