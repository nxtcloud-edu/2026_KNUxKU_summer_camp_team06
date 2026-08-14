import { Code2, CreditCard, Home, MessagesSquare } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { PlatformIcon, platformLabel } from '@/components/landing/platform-icon';
import { capturedExamples, type CapturedExample, type CoverTheme } from '@/data/landing';

const coverTheme: Record<CoverTheme, { className: string; Icon: typeof Home }> = {
  house: { className: 'from-amber-200 via-orange-300 to-rose-300', Icon: Home },
  code: { className: 'from-sky-300 via-indigo-300 to-violet-400', Icon: Code2 },
  card: { className: 'from-emerald-200 via-teal-300 to-cyan-400', Icon: CreditCard },
  chat: { className: 'from-fuchsia-200 via-pink-300 to-rose-400', Icon: MessagesSquare },
};

function CapturedCard({ platform, handle, snippet, keepOnNote, cover }: CapturedExample) {
  const theme = cover ? coverTheme[cover] : null;
  return <Card className="w-72 shrink-0 overflow-hidden py-0">
    {theme && <div className={`flex h-24 items-center justify-center bg-gradient-to-br ${theme.className}`}><theme.Icon className="size-8 text-white/90" strokeWidth={1.5} /></div>}
    <CardContent className="space-y-3 p-5">
      <div className="flex items-center gap-2"><PlatformIcon platform={platform} className="size-8" /><div className="flex flex-col leading-tight"><span className="text-sm font-medium text-foreground">{handle}</span><span className="text-[11px] text-muted-foreground">{platformLabel[platform]}</span></div></div>
      <blockquote className="text-sm leading-relaxed text-foreground/90">{snippet}</blockquote>
      <div className="flex items-start gap-1.5 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground"><span aria-hidden className="mt-0.5 text-primary">↳</span><span>{keepOnNote}</span></div>
    </CardContent>
  </Card>;
}

export function CapturedExamplesMarquee() {
  const half = Math.ceil(capturedExamples.length / 2);
  const row = (items: CapturedExample[], reverse = false) => <div className={`landing-marquee ${reverse ? 'is-reverse' : ''}`}>
    {[...items, ...items].map((item, index) => <CapturedCard key={`${item.handle}-${index}`} {...item} />)}
  </div>;
  return <div className="landing-marquee-wrap"><div className="landing-marquee-tilt">{row(capturedExamples.slice(0, half))}{row(capturedExamples.slice(half), true)}</div></div>;
}
