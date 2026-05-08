/**
 * storageCleanup.js
 * Supabase storage 의 orphan 파일 차단 helper.
 *
 * 두 가지 패턴:
 *   1. removeStorageOnError — upload 성공 후 DB insert 실패 시 storage 롤백
 *   2. cleanupMemberStorage — 회원 삭제 시 그 회원의 모든 사진/영상 정리
 *
 * 모든 호출은 try/catch 로 감싸 cleanup 실패가 본 작업을 막지 않게 함
 * (cleanup 실패해도 본 작업은 진행 — 후속 batch cleanup 으로 보완 가능).
 */

/**
 * Supabase getPublicUrl 의 결과 URL 에서 bucket 내부 path 만 추출.
 * 예) https://xxx.supabase.co/storage/v1/object/public/hold-photos/AUTH_ID/123.webp
 *     → AUTH_ID/123.webp
 */
export function extractStoragePath(publicUrl, bucket) {
  if (!publicUrl || typeof publicUrl !== 'string') return null
  const marker = `/storage/v1/object/public/${bucket}/`
  const idx = publicUrl.indexOf(marker)
  if (idx === -1) return null
  return publicUrl.slice(idx + marker.length)
}

/**
 * upload 성공 후 DB insert/update 가 실패한 경우 storage 파일 롤백.
 * 실패해도 본 흐름은 catch 에서 다시 처리 — 여기선 silent.
 */
export async function removeStorageOnError(supabase, bucket, path) {
  if (!supabase || !bucket || !path) return
  try {
    await supabase.storage.from(bucket).remove([path])
  } catch (e) {
    console.warn(`[storageCleanup] ${bucket}/${path} 롤백 실패:`, e.message)
  }
}

/**
 * 회원 삭제 시 그 회원이 만든 storage 파일 모두 정리.
 * DB cascade 로 logs/member_holds/diet_logs 가 사라지기 *전* 에 호출 필수.
 *
 * @param supabase    클라이언트
 * @param member      { id, auth_id }  — 회원 행
 * @param trainer     { id, auth_id }  — 담당 트레이너 행 (path prefix 용)
 */
export async function cleanupMemberStorage(supabase, member, trainer) {
  if (!supabase || !member?.id) return { ok: false, reason: 'invalid args' }
  const errors = []

  // 1. session-media — 트레이너가 회원에게 발송한 일지의 영상/사진
  //    path: ${trainer.id}/${reportId}/${mf.id}.${ext}
  //    DB cascade 로 logs 가 삭제되기 전에 media_urls 모아서 path 추출.
  try {
    const { data: logs } = await supabase
      .from('logs')
      .select('media_urls')
      .eq('member_id', member.id)
    const sessionMediaPaths = []
    for (const row of logs || []) {
      const urls = row.media_urls || []
      for (const m of urls) {
        const path = extractStoragePath(m?.url, 'session-media')
        if (path) sessionMediaPaths.push(path)
      }
    }
    if (sessionMediaPaths.length > 0) {
      const { error } = await supabase.storage.from('session-media').remove(sessionMediaPaths)
      if (error) errors.push(`session-media: ${error.message}`)
    }
  } catch (e) { errors.push(`session-media: ${e.message}`) }

  // 2. hold-photos — 정지(홀드) 사진
  //    path: ${trainer.auth_id}/${ts}.webp (member_holds.photo_url 에 저장)
  try {
    const { data: holds } = await supabase
      .from('member_holds')
      .select('photo_url')
      .eq('member_id', member.id)
    const holdPaths = []
    for (const row of holds || []) {
      const path = extractStoragePath(row.photo_url, 'hold-photos')
      if (path) holdPaths.push(path)
    }
    if (holdPaths.length > 0) {
      const { error } = await supabase.storage.from('hold-photos').remove(holdPaths)
      if (error) errors.push(`hold-photos: ${error.message}`)
    }
  } catch (e) { errors.push(`hold-photos: ${e.message}`) }

  // 3. diet-photos — 회원의 식단 사진. path: ${member.auth_id}/${ts}.webp
  //    auth_id 폴더 통째로 list + remove.
  if (member.auth_id) {
    try {
      const { data: files } = await supabase.storage.from('diet-photos').list(member.auth_id, { limit: 1000 })
      const paths = (files || []).map(f => `${member.auth_id}/${f.name}`)
      if (paths.length > 0) {
        const { error } = await supabase.storage.from('diet-photos').remove(paths)
        if (error) errors.push(`diet-photos: ${error.message}`)
      }
    } catch (e) { errors.push(`diet-photos: ${e.message}`) }
  }

  // 4. community-photos — 회원이 작성한 게시물의 사진. path: ${member.auth_id}/${ts}.ext
  if (member.auth_id) {
    try {
      const { data: files } = await supabase.storage.from('community-photos').list(member.auth_id, { limit: 1000 })
      const paths = (files || []).map(f => `${member.auth_id}/${f.name}`)
      if (paths.length > 0) {
        const { error } = await supabase.storage.from('community-photos').remove(paths)
        if (error) errors.push(`community-photos: ${error.message}`)
      }
    } catch (e) { errors.push(`community-photos: ${e.message}`) }
  }

  return { ok: errors.length === 0, errors }
}
