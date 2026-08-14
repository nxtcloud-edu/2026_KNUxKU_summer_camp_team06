import { siInstagram, siKakaotalk, siNaver, siThreads } from 'simple-icons';
import { cn } from '@/lib/utils';

export type LandingPlatform = 'instagram' | 'threads' | 'kakaotalk' | 'naver_blog';

const iconData: Record<LandingPlatform, { path: string }> = {
  instagram: siInstagram,
  threads: siThreads,
  kakaotalk: siKakaotalk,
  naver_blog: siNaver,
};

const bgClass: Record<LandingPlatform, string> = {
  instagram: 'bg-gradient-to-br from-[#FEDA75] via-[#D62976] to-[#4F5BD5]',
  threads: 'bg-black',
  kakaotalk: 'bg-[#FFCD00]',
  naver_blog: 'bg-[#03C75A]',
};

const glyphColor: Record<LandingPlatform, string> = {
  instagram: '#ffffff', threads: '#ffffff', kakaotalk: '#381e1f', naver_blog: '#ffffff',
};

export function PlatformIcon({ platform, className }: { platform: LandingPlatform; className?: string }) {
  return <span className={cn('inline-flex shrink-0 items-center justify-center rounded-full shadow-sm ring-1 ring-black/5', bgClass[platform], className)}>
    <svg viewBox="0 0 24 24" className="h-[58%] w-[58%]" fill={glyphColor[platform]}><path d={iconData[platform].path} /></svg>
  </span>;
}

export const platformLabel: Record<LandingPlatform, string> = {
  instagram: 'Instagram', threads: 'Threads', kakaotalk: '카카오톡', naver_blog: '네이버 블로그',
};
