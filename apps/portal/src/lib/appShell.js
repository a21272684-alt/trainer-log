// apps/portal/src/lib/appShell.js
// 트레이너 앱 · 회원 앱 화면을 '웹페이지'가 아니라 '앱'처럼 보이게 하는 공용 도구 (2026-11).
//
// 왜: 안드로이드 앱(TWA = 크롬)에서 화면 끝에서 한 번 더 밀면 크롬이 화면 전체를 늘였다 되돌리는데,
//     이때 바닥에 고정된 아래 탭 · 위 메뉴줄까지 같이 끌려가서 탭이 바닥에서 떨어졌다 붙는 것처럼 보였다.
//   1) useAppShell — 앱 화면이 떠 있는 동안 <html> 에 app-shell 클래스를 붙인다.
//      global.css 의 html.app-shell 규칙(overscroll-behavior-y: none)이 그 효과를 끈다.
//      같은 규칙이 크롬의 당겨서 새로고침도 끈다.
//   2) useResumeRefresh — 그래서 당겨서 새로고침 대신, 다른 앱에 갔다가 돌아오면 새 내용을 조용히 불러온다.
//   3) mergeLatest · appendUnique — 목록을 처음 20건으로 되돌리지 않고 새 항목만 앞에 붙이는 합치기
//      (더 불러온 옛 항목과 스크롤 위치를 그대로 둔다).

import { useEffect, useRef } from 'react'

/** 앱 화면이 떠 있는 동안(active) <html> 에 app-shell 클래스를 붙인다. */
export function useAppShell(active) {
  useEffect(() => {
    if (!active) return
    const root = document.documentElement
    root.classList.add('app-shell')
    return () => root.classList.remove('app-shell')
  }, [active])
}

// 몇 초만 다른 화면을 보고 온 건 건너뛴다 (화면을 껐다 켜거나 앱을 오가는 것마다 서버를 부르지 않게).
// 회원이 카톡으로 '일지 보냈어요'를 보고 바로 넘어오는 경우도 잡히도록 짧게 둔다.
const MIN_AWAY_MS = 10 * 1000

/**
 * 다른 앱에 갔다가(또는 화면을 껐다가) MIN_AWAY_MS 이상 지나 돌아오면 onResume 을 부른다.
 * onResume 은 매 렌더의 최신 함수를 쓴다 (state 를 옛 값으로 읽지 않게).
 */
export function useResumeRefresh(onResume, enabled) {
  const onResumeRef = useRef(onResume)
  useEffect(() => { onResumeRef.current = onResume })
  useEffect(() => {
    if (!enabled) return
    let hiddenAt = document.visibilityState === 'hidden' ? Date.now() : 0
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return }
      const away = hiddenAt ? Date.now() - hiddenAt : 0
      hiddenAt = 0
      if (away >= MIN_AWAY_MS) onResumeRef.current?.()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [enabled])
}

/**
 * 최신 목록(latest, 최신순)을 지금 목록(prev)에 합친다.
 * 새 항목은 앞에 붙이고, 이미 있는 항목은 새 값으로 바꾸고(확인 표시 등), 더 불러온 옛 항목은 그대로 둔다.
 */
export function mergeLatest(prev, latest) {
  if (!latest?.length) return prev
  const latestById = new Map(latest.map(row => [row.id, row]))
  const known = new Set(prev.map(row => row.id))
  const added = latest.filter(row => !known.has(row.id))
  const updated = prev.map(row => latestById.get(row.id) || row)
  return added.length ? [...added, ...updated] : updated
}

/**
 * '더 보기'로 받은 다음 쪽(rows)을 뒤에 붙이되 이미 있는 항목은 뺀다.
 * mergeLatest 가 새 항목을 앞에 붙이면 다음 쪽 첫 몇 건이 이미 보이는 항목과 겹치기 때문.
 */
export function appendUnique(prev, rows) {
  if (!rows?.length) return prev
  const known = new Set(prev.map(row => row.id))
  const fresh = rows.filter(row => !known.has(row.id))
  return fresh.length ? [...prev, ...fresh] : prev
}
