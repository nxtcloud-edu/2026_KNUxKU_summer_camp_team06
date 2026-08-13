import { ArrowRight, CalendarClock, CheckCircle2, Quote } from 'lucide-react'
import { CapturedExamplesMarquee } from '@/components/captured-marquee'
import { Card, CardContent } from '@/components/ui/card'
import { demoConditions, demoRawText, demoTasks } from '@/data/how-it-works'

// TODO: 실제 KEEP:ON 자료(로고, 스크린샷, 실제 사용자 후기 등)가 오면 세부 톤/비주얼을
// 다듬는다. 카피와 예시 데이터는 docs/landingpage.md + 실제 파이프라인 실행 결과 기반.

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
      {description && <p className="mt-3 text-muted-foreground">{description}</p>}
    </div>
  )
}

function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="text-lg font-semibold tracking-tight">KEEP:ON</span>
          <nav className="flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#examples" className="hover:text-foreground">
              저장 예시
            </a>
            <a href="#how" className="hover:text-foreground">
              어떻게 동작하나요
            </a>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-5xl px-6 py-24 text-center">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            저장은 했는데 실행은 안 하는 청년을 위해
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            저장한 순간부터 마감까지 끌고 가는 AI 에이전트, KEEP:ON
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <a
              href="#how"
              className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
            >
              시작하기
            </a>
            <a
              href="#examples"
              className="rounded-md border border-border px-5 py-2.5 text-sm font-medium"
            >
              저장 예시 보기
            </a>
          </div>
        </section>

        {/* 저장 예시 마퀴 */}
        <section id="examples" className="pb-24">
          <SectionHeading
            eyebrow="Save from anywhere"
            title="이런 거 저장해두고 다시 안 보시죠?"
            description="공모전, 지원사업, 서포터즈부터 정보성 게시물, 마감 있는 이벤트까지 — 어디서 저장했든 KEEP:ON은 저장한 순간 뭐가 다른지 구분합니다."
          />
          <div className="mt-10">
            <CapturedExamplesMarquee />
          </div>
        </section>

        {/* 어떻게 동작하나요 */}
        <section id="how" className="mx-auto max-w-5xl px-6 pb-24">
          <SectionHeading
            eyebrow="How KEEP:ON works"
            title="저장 하나가 실행 계획이 되기까지"
            description="실제 공고 하나로 KEEP:ON 파이프라인을 그대로 돌린 결과입니다 (연출 아님)."
          />

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            <Card>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Quote className="size-4" />
                  1. 저장한 원문
                </div>
                <p className="whitespace-pre-line text-sm text-foreground/90">{demoRawText}</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <CheckCircle2 className="size-4" />
                  2. KEEP:ON이 뽑아낸 자격조건
                </div>
                <ul className="space-y-2">
                  {demoConditions.map((c, i) => (
                    <li key={i} className="rounded-md border border-border bg-muted/50 p-2.5 text-xs">
                      <span className="mr-2 rounded bg-secondary px-1.5 py-0.5 font-medium text-secondary-foreground">
                        {c.type}
                      </span>
                      {c.quote}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  원문에 없는 내용은 절대 만들어내지 않습니다 — 근거가 되는 원문 그대로만 인용합니다.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <CalendarClock className="size-4" />
                  3. 김서연님을 위한 실행 계획
                </div>
                <ul className="space-y-2">
                  {demoTasks.map((t, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs">
                      <ArrowRight className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
                      <span className="flex-1">{t.title}</span>
                      <span className="shrink-0 text-muted-foreground">{t.due}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">마감에서 역산해 자동으로 배치, 캘린더에 등록됩니다.</p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-border">
          <div className="mx-auto max-w-3xl px-6 py-20 text-center">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              다음에 저장할 땐, 저장으로 끝내지 마세요
            </h2>
            <p className="mt-3 text-muted-foreground">Chrome 확장으로 지금 바로 시작하세요.</p>
            <a
              href="#"
              className="mt-8 inline-block rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground"
            >
              KEEP:ON 시작하기
            </a>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        KEEP:ON · 2026 강원대x고려대 Summer Agentic AI 심화 몰입 캠프
      </footer>
    </div>
  )
}

export default App
