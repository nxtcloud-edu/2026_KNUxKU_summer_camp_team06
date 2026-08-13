import DemoOne from '@/components/ui/3d-testimonails-demo'

// TODO: 실제 KEEP:ON 자료(카피, 로고, 스크린샷, 실제 사용자 후기 등)가 오면 아래
// PLACEHOLDER 섹션들을 교체한다. 지금은 구조/스타일링만 잡아둔 상태.

function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="text-lg font-semibold tracking-tight">KEEP:ON</span>
          <nav className="flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#how" className="hover:text-foreground">
              어떻게 동작하나요
            </a>
            <a href="#testimonials" className="hover:text-foreground">
              후기
            </a>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero — PLACEHOLDER: Project.md 한 줄 정의로 채워둠, 실제 카피 오면 교체 */}
        <section className="mx-auto max-w-5xl px-6 py-24 text-center">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            저장은 했는데 실행은 안 하는 청년을 위해
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            저장한 순간부터 마감까지 끌고 가는 AI 에이전트, KEEP:ON
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <a
              href="#"
              className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
            >
              시작하기
            </a>
            <a
              href="#how"
              className="rounded-md border border-border px-5 py-2.5 text-sm font-medium"
            >
              더 알아보기
            </a>
          </div>
        </section>

        {/* Testimonials — PLACEHOLDER 데이터 (컴포넌트 배선 확인용). 실제 후기로 교체 예정 */}
        <section id="testimonials" className="mx-auto max-w-5xl px-6 pb-24">
          <h2 className="mb-8 text-center text-2xl font-semibold tracking-tight">
            청년들의 이야기
          </h2>
          <div className="flex justify-center">
            <DemoOne />
          </div>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            (플레이스홀더 데이터 — 실제 후기/사용자 자료로 교체 예정)
          </p>
        </section>
      </main>
    </div>
  )
}

export default App
