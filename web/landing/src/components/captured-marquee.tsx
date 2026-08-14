import { Code2, CreditCard, Home, MessagesSquare } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Marquee } from '@/components/ui/3d-testimonails'
import { PlatformIcon, platformLabel } from '@/components/platform-icon'
import { capturedExamples, type CapturedExample, type CoverTheme } from '@/data/captured-examples'

// 실제 게시물 원문 스크린샷은 못 쓴다(로그인월/자동수집 정책 문제, R6) — 대신
// 콘텐츠 성격에 맞는 그라데이션 커버로 색감을 준다.
const coverTheme: Record<CoverTheme, { className: string; Icon: typeof Home }> = {
  house: { className: 'from-amber-200 via-orange-300 to-rose-300', Icon: Home },
  code: { className: 'from-sky-300 via-indigo-300 to-violet-400', Icon: Code2 },
  card: { className: 'from-emerald-200 via-teal-300 to-cyan-400', Icon: CreditCard },
  chat: { className: 'from-fuchsia-200 via-pink-300 to-rose-400', Icon: MessagesSquare }
}

function CapturedCard({ platform, handle, snippet, keepOnNote, cover }: CapturedExample) {
  const theme = cover ? coverTheme[cover] : null
  return (
    <Card className="w-72 overflow-hidden py-0">
      {theme && (
        <div className={`flex h-24 items-center justify-center bg-gradient-to-br ${theme.className}`}>
          <theme.Icon className="size-8 text-white/90" strokeWidth={1.5} />
        </div>
      )}
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center gap-2">
          <PlatformIcon platform={platform} className="size-8" />
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-medium text-foreground">{handle}</span>
            <span className="text-[11px] text-muted-foreground">{platformLabel[platform]}</span>
          </div>
        </div>
        <blockquote className="text-sm leading-relaxed text-foreground/90">{snippet}</blockquote>
        <div className="flex items-start gap-1.5 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
          <span aria-hidden className="mt-0.5 text-primary">
            ↳
          </span>
          <span>{keepOnNote}</span>
        </div>
      </CardContent>
    </Card>
  )
}

export function CapturedExamplesMarquee() {
  const half = Math.ceil(capturedExamples.length / 2)
  const firstRow = capturedExamples.slice(0, half)
  const secondRow = capturedExamples.slice(half)

  return (
    <div className="relative flex w-full flex-col gap-4 overflow-hidden [perspective:400px]">
      <div
        style={{
          transform: 'rotateX(10deg) rotateZ(-2deg)',
        }}
      >
        <Marquee pauseOnHover className="[--duration:38s]">
          {firstRow.map((item, i) => (
            <CapturedCard key={i} {...item} />
          ))}
        </Marquee>
        <Marquee pauseOnHover reverse className="[--duration:38s]">
          {secondRow.map((item, i) => (
            <CapturedCard key={i} {...item} />
          ))}
        </Marquee>
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-1/6 bg-gradient-to-r from-background"></div>
      <div className="pointer-events-none absolute inset-y-0 right-0 w-1/6 bg-gradient-to-l from-background"></div>
    </div>
  )
}
