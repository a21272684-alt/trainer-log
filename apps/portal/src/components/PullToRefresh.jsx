// apps/portal/src/components/PullToRefresh.jsx
// 오운 전용 '당겨서 새로고침' (2026-11, 2단계).
//
// 크롬의 당겨서 새로고침은 화면 끝 늘어남 효과와 함께 꺼 두었다 (lib/appShell.js — 바닥에 고정된 아래 탭까지
// 끌려가던 문제). 그 자리를 이걸로 채운다: 페이지가 맨 위일 때 아래로 당기면 위 메뉴줄 · 아래 탭은 그대로 두고
// 목록만 내려오고, 충분히 당겼다 놓으면 새 내용을 불러온다 (인스타그램 같은 앱 방식).
//
// 쓰는 법:
//   const ptr = usePullToRefresh(() => 새로고침 Promise, 켤지 여부)
//   <PullIndicator indicatorRef={ptr.indicatorRef} />   ← 위 메뉴줄 바로 아래 (내려오는 부분 밖)
//   <div ref={ptr.contentRef}> …목록… </div>            ← 내려오는 부분 (모달 · 고정 요소는 이 밖에 둔다)
//
// 끼어들지 않는 경우: 페이지가 맨 위가 아닐 때 · 위로나 옆으로 미는 몸짓 · 입력칸 · 열린 팝업 ·
// 좌우로 넘기는 칩 줄 · 안에서 따로 스크롤되는 칸 · 두 손가락 · 새로고침 중.

import { useEffect, useRef } from 'react'
import Icon from './Icon'

const ARM_AT = 64        // 목록이 이만큼 내려온 상태에서 놓으면 새로고침
const MAX_PULL = 96      // 목록이 내려오는 최대 거리
const HOLD_AT = 52       // 새로고침하는 동안 목록을 내려 두는 거리 (표시가 보이게)
const MIN_SPIN_MS = 600  // 금방 끝나도 돌았다는 게 보이게
const EASE = '0.25s cubic-bezier(0.2, 0.8, 0.2, 1)'

// 손가락이 움직인 거리 → 목록이 내려오는 거리 (처음엔 절반, 새로고침 지점을 넘으면 더 뻑뻑하게)
const damp = dy => (dy <= 0 ? 0 : Math.min(MAX_PULL, dy < ARM_AT * 2 ? dy / 2 : ARM_AT + (dy - ARM_AT * 2) / 5))
const scrollTop = () => window.scrollY || document.documentElement.scrollTop || 0

export function usePullToRefresh(onRefresh, enabled) {
  const contentRef = useRef(null)
  const indicatorRef = useRef(null)
  const onRefreshRef = useRef(onRefresh)
  useEffect(() => { onRefreshRef.current = onRefresh })

  useEffect(() => {
    if (!enabled) return
    const g = { tracking: false, pulling: false, busy: false, x0: 0, y0: 0, dist: 0 }
    let moveAttached = false

    // solid: 새로고침 중 — 표시를 진하게 · 라임으로 고정. armed: 라임 여부를 직접 정할 때 (새로고침이 끝나 사라지는 동안 라임 유지)
    function paint(dist, { animate = false, solid = false, armed } = {}) {
      const content = contentRef.current
      const ind = indicatorRef.current
      if (!content || !ind) return
      content.style.transition = animate ? `transform ${EASE}` : 'none'
      // 0 이면 transform 을 아예 지운다 — 남겨 두면 안쪽 position:fixed 요소의 기준이 이 칸으로 바뀐다
      content.style.transform = dist > 0 ? `translate3d(0, ${dist}px, 0)` : ''
      ind.style.transition = animate ? `transform ${EASE}, opacity ${EASE}` : 'none'
      ind.style.opacity = solid ? '1' : String(Math.min(1, dist / ARM_AT))
      ind.style.transform = `translate3d(0, ${Math.max(-44, dist / 2 - 18)}px, 0) rotate(${solid ? 0 : dist * 4}deg)`
      ind.classList.toggle('armed', armed ?? (solid || dist >= ARM_AT))
    }

    async function refresh() {
      g.busy = true
      paint(HOLD_AT, { animate: true, solid: true })
      indicatorRef.current?.classList.add('spinning')
      const started = Date.now()
      try { await onRefreshRef.current?.() } catch (err) { console.warn('[pullToRefresh]', err?.message) }
      const rest = MIN_SPIN_MS - (Date.now() - started)
      if (rest > 0) await new Promise(r => setTimeout(r, rest))
      indicatorRef.current?.classList.remove('spinning')
      paint(0, { animate: true, armed: true })   // 흰색으로 깜빡이지 않고 라임인 채로 사라지게
      g.busy = false
    }

    // 목록 칸 밖 · 입력칸 · 팝업 · 좌우로 넘기는 줄 · 안에서 스크롤된 칸에서 시작한 몸짓이면 끼어들지 않는다
    function startsOutside(target) {
      const content = contentRef.current
      if (!content || !(target instanceof Element) || !content.contains(target)) return true
      if (target.closest('input, textarea, select, [contenteditable="true"], .modal-overlay, [role="dialog"]')) return true
      for (let el = target; el && el !== content; el = el.parentElement) {
        if (el.scrollTop > 0) return true
        if (el.scrollWidth > el.clientWidth + 1) {
          const ox = getComputedStyle(el).overflowX
          if (ox === 'auto' || ox === 'scroll') return true
        }
      }
      return false
    }

    // 손가락이 닿은 요소가 몸짓 도중 화면에서 빠지면(목록이 다시 그려질 때) 이후 터치 이벤트는 그 빠진 요소로만 가고
    // window 까지 올라오지 않는다 → 목록이 내려간 채 멈춘다(2026-11-16 시험에서 재현). 그래서 닿은 요소에도 귀를 대고,
    // 그 요소가 빠졌을 때만 여기서 처리한다 (붙어 있으면 window 쪽이 처리).
    let watched = null
    const ifDetached = fn => e => { if (!e.currentTarget.isConnected) fn(e) }
    const onTargetMove = ifDetached(e => onMove(e))
    const onTargetEnd = ifDetached(() => onEnd())
    const onTargetCancel = ifDetached(() => onCancel())
    function watchTarget(el) {
      unwatchTarget()
      watched = el
      el.addEventListener('touchmove', onTargetMove, { passive: false })
      el.addEventListener('touchend', onTargetEnd, { passive: true })
      el.addEventListener('touchcancel', onTargetCancel, { passive: true })
    }
    function unwatchTarget() {
      if (!watched) return
      watched.removeEventListener('touchmove', onTargetMove)
      watched.removeEventListener('touchend', onTargetEnd)
      watched.removeEventListener('touchcancel', onTargetCancel)
      watched = null
    }

    function onStart(e) {
      if (g.pulling) { onCancel(); return }   // 당기는 중에 두 번째 손가락이 닿으면 취소 (목록이 내려간 채 남지 않게)
      g.tracking = false
      unwatchTarget()
      if (g.busy || e.touches.length !== 1 || scrollTop() > 0 || startsOutside(e.target)) return
      g.tracking = true
      g.pulling = false
      g.dist = 0
      g.x0 = e.touches[0].clientX
      g.y0 = e.touches[0].clientY
      watchTarget(e.target)
    }

    function onMove(e) {
      if (!g.tracking) return
      if (e.touches.length !== 1) { onCancel(); return }
      const dx = e.touches[0].clientX - g.x0
      const dy = e.touches[0].clientY - g.y0
      if (!g.pulling) {
        if (dx === 0 && dy === 0) return
        // 위로(페이지 내리기) · 옆으로 미는 몸짓은 원래대로 둔다
        if (dy <= 0 || Math.abs(dx) > dy + 4 || scrollTop() > 0) { g.tracking = false; return }
        g.pulling = true
      }
      // 당기는 동안엔 브라우저 스크롤 · 아이폰 튕김 대신 목록만 내려오게
      if (e.cancelable) e.preventDefault()
      g.dist = damp(dy)
      paint(g.dist)
    }

    function onEnd() {
      if (!g.tracking) return
      const armed = g.pulling && g.dist >= ARM_AT
      g.tracking = false
      g.pulling = false
      unwatchTarget()
      if (armed) refresh()
      else paint(0, { animate: true })
    }

    function onCancel() {
      if (!g.tracking) return
      g.tracking = false
      g.pulling = false
      unwatchTarget()
      paint(0, { animate: true })
    }

    // 당기는 도중 다른 앱으로 넘어가면 취소 (돌아왔을 때 목록이 내려간 채 남지 않게)
    function onVisibility() { if (document.visibilityState === 'hidden') onCancel() }

    // 막을 수 있는(passive:false) touchmove 는 페이지가 맨 위일 때만 붙인다 —
    // 목록을 스크롤하는 동안엔 브라우저가 이 함수를 기다리지 않게 (스크롤이 버벅이지 않게)
    function syncMove() {
      const atTop = scrollTop() <= 0
      if (atTop && !moveAttached) { window.addEventListener('touchmove', onMove, { passive: false }); moveAttached = true }
      else if (!atTop && moveAttached && !g.pulling) { window.removeEventListener('touchmove', onMove); moveAttached = false }
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    window.addEventListener('touchcancel', onCancel, { passive: true })
    window.addEventListener('scroll', syncMove, { passive: true })
    document.addEventListener('visibilitychange', onVisibility)
    syncMove()
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onCancel)
      window.removeEventListener('scroll', syncMove)
      document.removeEventListener('visibilitychange', onVisibility)
      if (moveAttached) window.removeEventListener('touchmove', onMove)
      unwatchTarget()
      paint(0)
    }
  }, [enabled])

  return { contentRef, indicatorRef }
}

/** 당겨서 새로고침 표시 — 위 메뉴줄 바로 아래(내려오는 부분 바로 위)에 둔다. 모양은 global.css 의 .ptr-* */
export function PullIndicator({ indicatorRef }) {
  return (
    <div className="ptr-slot" aria-hidden="true">
      <div ref={indicatorRef} className="ptr-indicator">
        <Icon name="refresh" size={18} strokeWidth={2.2} />
      </div>
    </div>
  )
}
