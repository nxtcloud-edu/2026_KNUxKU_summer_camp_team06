import { siInstagram, siKakaotalk, siNaver, siThreads } from 'simple-icons'
import { cn } from '@/lib/utils'

export type Platform = 'instagram' | 'threads' | 'kakaotalk' | 'naver_blog'

const iconData: Record<Platform, { path: string }> = {
  instagram: siInstagram,
  threads: siThreads,
  kakaotalk: siKakaotalk,
  naver_blog: siNaver,
}

// 실제 앱 아이콘 배경/글리프 색상에 맞춤 (인스타그램은 실제로 그라데이션 브랜드 컬러)
const bgClass: Record<Platform, string> = {
  instagram: 'bg-gradient-to-br from-[#FEDA75] via-[#D62976] to-[#4F5BD5]',
  threads: 'bg-black',
  kakaotalk: 'bg-[#FFCD00]',
  naver_blog: 'bg-[#03C75A]',
}

const glyphColor: Record<Platform, string> = {
  instagram: '#ffffff',
  threads: '#ffffff',
  kakaotalk: '#381e1f',
  naver_blog: '#ffffff',
}

export function PlatformIcon({ platform, className }: { platform: Platform; className?: string }) {
  const icon = iconData[platform]
  return (
    // 실제 앱 아이콘처럼 둥근 사각형(squircle) — 원형 프로필 배지가 아니라 "이 앱에서
    // 왔다"는 출처 표시이므로 실제 앱 아이콘 형태에 맞춘다.
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-[26%] shadow-sm ring-1 ring-black/5',
        bgClass[platform],
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="h-[64%] w-[64%]" fill={glyphColor[platform]}>
        <path d={icon.path} />
      </svg>
    </span>
  )
}

export const platformLabel: Record<Platform, string> = {
  instagram: 'Instagram',
  threads: 'Threads',
  kakaotalk: '카카오톡',
  naver_blog: '네이버 블로그',
}
