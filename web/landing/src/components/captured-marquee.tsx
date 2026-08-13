import { ArrowRight, Camera, MessageCircle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Marquee } from '@/components/ui/3d-testimonails'
import {
  capturedExamples,
  categoryColor,
  categoryLabel,
  type CapturedExample,
} from '@/data/captured-examples'

const platformIcon = {
  threads: MessageCircle,
  instagram: Camera,
  kakaotalk: MessageCircle,
} as const

const platformLabel = {
  threads: 'Threads',
  instagram: 'Instagram',
  kakaotalk: '카카오톡',
} as const

function CapturedCard({ platform, handle, snippet, category, keepOnNote }: CapturedExample) {
  const Icon = platformIcon[platform]
  return (
    <Card className="w-72">
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Icon className="size-3.5" />
            <span>{platformLabel[platform]}</span>
            <span className="text-muted-foreground/60">·</span>
            <span>{handle}</span>
          </div>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${categoryColor[category]}`}
          >
            {categoryLabel[category]}
          </span>
        </div>
        <blockquote className="text-sm text-foreground/90">{snippet}</blockquote>
        <div className="flex items-start gap-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
          <ArrowRight className="mt-0.5 size-3.5 shrink-0" />
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
    <div className="relative flex w-full flex-col overflow-hidden [perspective:400px]">
      <div
        style={{
          transform: 'rotateX(10deg) rotateZ(-2deg)',
        }}
      >
        <Marquee pauseOnHover className="[--duration:35s]">
          {firstRow.map((item, i) => (
            <CapturedCard key={i} {...item} />
          ))}
        </Marquee>
        <Marquee pauseOnHover reverse className="[--duration:35s]">
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
