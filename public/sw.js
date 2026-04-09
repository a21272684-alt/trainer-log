// TrainerLog Service Worker
// 역할: 탭이 닫혀있어도 Web Push 수신 후 알림 표시

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

// Web Push 수신 → 알림 표시 (브라우저가 완전히 닫혀있어도 동작)
self.addEventListener('push', e => {
  let payload = { title: '🏋️ TrainerLog', body: '수업 알림이 도착했어요' }
  if (e.data) {
    try { payload = e.data.json() } catch { payload.body = e.data.text() }
  }
  const options = {
    body: payload.body || '',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: payload.tag || 'trainerlog',
    renotify: false,
    data: payload.data || {}
  }
  e.waitUntil(self.registration.showNotification(payload.title, options))
})

// 알림 클릭 → 앱 탭으로 포커스 이동
self.addEventListener('notificationclick', e => {
  e.notification.close()
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client)
          return client.focus()
      }
      return clients.openWindow('/')
    })
  )
})
