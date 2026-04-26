import { supabase } from './supabase'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

export async function subscribeToPush(trainerId) {
  const reg = await navigator.serviceWorker.ready
  const existing = await reg.pushManager.getSubscription()
  const sub = existing || await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(import.meta.env.VITE_VAPID_PUBLIC_KEY)
  })
  const json = sub.toJSON()
  await supabase.from('push_subscriptions').upsert({
    trainer_id: trainerId,
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth
  }, { onConflict: 'trainer_id' })
  return sub
}

export async function scheduleNotification(trainerId, block, memberName, notifMinutes) {
  const [h, m] = block.start.split(':').map(Number)
  const scheduledAt = new Date(block.date)
  scheduledAt.setHours(h, m - notifMinutes, 0, 0)
  if (scheduledAt <= new Date()) return
  await supabase.from('scheduled_notifications').upsert({
    trainer_id: trainerId,
    block_id: block.id,
    scheduled_at: scheduledAt.toISOString(),
    title: '🏋️ 오운',
    body: `${notifMinutes}분 후 ${memberName}님과 수업이 있어요`
  }, { onConflict: 'trainer_id,block_id' })
}

export async function deleteScheduledNotification(trainerId, blockId) {
  await supabase.from('scheduled_notifications')
    .delete()
    .eq('trainer_id', trainerId)
    .eq('block_id', blockId)
}
