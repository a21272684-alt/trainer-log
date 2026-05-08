/**
 * imageCompress.js
 * Canvas 기반 이미지 압축 — 의존성 없음, iOS 완벽 지원.
 *
 * 사용처:
 *  - Trainer 측 운동/홀딩 사진 업로드 (hold-photos)
 *  - Member 측 식단 사진 업로드 (diet-photos)
 *  - Member 측 커뮤니티 게시물 사진 (community-photos) — 후속
 *
 * 반환: { blob, dataUrl, sizeKB }
 *  - blob:    Supabase storage upload 직접 사용 가능
 *  - dataUrl: <img src=...> 즉시 미리보기 / DB 저장 모두 가능
 *  - sizeKB:  업로드 전 사용자 안내용
 */
export async function compressImage(file, options = {}) {
  const {
    maxSize = 1200,        // 긴 변 최대 픽셀
    quality = 0.80,        // WebP 품질 (0~1)
    format  = 'image/webp',
  } = options

  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      try {
        let { width, height } = img
        if (width > maxSize) {
          height = Math.round(height * maxSize / width)
          width  = maxSize
        }
        if (height > maxSize) {
          width  = Math.round(width  * maxSize / height)
          height = maxSize
        }
        const canvas = document.createElement('canvas')
        canvas.width  = width
        canvas.height = height
        canvas.getContext('2d').drawImage(img, 0, 0, width, height)
        canvas.toBlob(blob => {
          URL.revokeObjectURL(url)
          if (!blob) { reject(new Error('이미지 변환 실패')); return }
          const reader = new FileReader()
          reader.onload  = e => resolve({
            blob,
            dataUrl: e.target.result,
            sizeKB:  Math.round(blob.size / 1024),
          })
          reader.onerror = () => reject(new Error('이미지 변환 후 읽기 실패'))
          reader.readAsDataURL(blob)
        }, format, quality)
      } catch (e) {
        URL.revokeObjectURL(url)
        reject(e)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('이미지 로드 실패'))
    }
    img.src = url
  })
}
