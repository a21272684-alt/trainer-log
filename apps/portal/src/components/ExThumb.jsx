import { exerciseIllustration } from '../lib/exerciseIllustrations'

// 운동 동작 일러스트 썸네일 (밝은 박스 — 다크 테마에서도 보이게). 매칭 없으면 렌더 안 함.
export default function ExThumb({ name, size = 46 }) {
  const src = exerciseIllustration(name)
  if (!src) return null
  return (
    <div style={{flexShrink:0,width:size,height:size,borderRadius:'9px',background:'#f4f6f0',border:'1px solid #e6e8e0',display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden'}}>
      <img src={src} alt={`${name} 동작`} loading="lazy" style={{width:'88%',height:'88%',objectFit:'contain'}} />
    </div>
  )
}
