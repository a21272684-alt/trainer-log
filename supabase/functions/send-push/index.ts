import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// @ts-ignore
import webpush from 'npm:web-push'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT')!

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // 발송 대상: scheduled_at <= now, sent = false
  const { data: notifications } = await supabase
    .from('scheduled_notifications')
    .select('*, push_subscriptions!inner(endpoint, p256dh, auth)')
    .eq('sent', false)
    .lte('scheduled_at', new Date().toISOString())

  if (!notifications?.length) {
    return new Response(JSON.stringify({ sent: 0 }), { headers: { 'Content-Type': 'application/json' } })
  }

  let sent = 0
  for (const notif of notifications) {
    const sub = notif.push_subscriptions
    if (!sub) continue
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title: notif.title, body: notif.body, tag: notif.block_id })
      )
      await supabase.from('scheduled_notifications').update({ sent: true }).eq('id', notif.id)
      sent++
    } catch (err) {
      console.error('push failed', notif.id, err)
    }
  }

  return new Response(JSON.stringify({ sent }), { headers: { 'Content-Type': 'application/json' } })
})
