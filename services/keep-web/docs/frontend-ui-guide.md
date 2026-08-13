# KEEP:ON 프론트엔드 UI 체계 가이드

`services/keep-web/frontend` 는 두 개의 스타일 체계를 함께 쓴다.
새 화면은 **shadcn/ui + Tailwind** 로 만들고, 기존 커스텀 CSS 화면은 손댈 일이 있을 때 함께 옮긴다.

## 1. 현재 상태

| 영역 | 체계 | 위치 |
|---|---|---|
| 캘린더 | shadcn/ui + Tailwind | `src/pages/CalendarPage.tsx`, `src/components/ui/event-manager.tsx` |
| 조건 판정 근거 | shadcn/ui | `src/components/opportunity/EligibilityEvidence.tsx` |
| Keep 처리 상태 | shadcn/ui | `src/components/storage/IntakeProgress.tsx` |
| 저장 목록 빈 상태 | shadcn/ui | `src/components/storage/SavedEmptyState.tsx` |
| 프로필 온보딩·판정 인과 | shadcn/ui | `src/components/profile/*` |
| 홈 / 저장 목록 / 상세 / 실행 계획 / 챗 / 프로필 골격 | 커스텀 CSS | `src/App.tsx` + `src/index.css` |
| 앱 셸(상단바·하단 탭·알림 팝오버) | 커스텀 CSS | `src/components/AppShell.tsx` + `src/index.css` |

## 2. 두 체계가 충돌하지 않는 이유

Tailwind 는 **추가 모드**로 설정돼 있다. (`tailwind.config.js`)

- `corePlugins.preflight = false` — Tailwind 가 기존 페이지를 리셋하지 않는다.
- shadcn 토큰은 `--sd-*` 로 네임스페이스를 뒀다. `index.css` 의 `--background`, `--border`, `--primary` 와 이름이 겹치지 않는다.
- preflight 대체 리셋은 `src/styles/shadcn.css` 안에서 `.tw-root` 스코프로만 적용된다.
- 리셋 규칙은 전부 `:where()` 로 감싸 **명시도 0** 이다. 이걸 빼면 `border-width: 0` 이 `.border` 를 이기고, `h2 { font-size: inherit }` 가 `text-xl` 을 이겨서 테두리와 글자 크기가 사라진다.

## 3. 색 토큰은 한 곳에서

브랜드 색의 원본은 `src/index.css` 의 `:root` 다.
shadcn 은 `hsl(var(--sd-*))` 형태를 요구하므로, 같은 색을 HSL 3요소로 한 번 더 선언해 두고 (`--hsl-*`) `shadcn.css` 가 그 값을 참조한다.

```
index.css :root --primary: #2f89bd
                --hsl-primary: 202 60% 46%
                        ↓
shadcn.css .tw-root --sd-primary: var(--hsl-primary)
                        ↓
tailwind.config.js  colors.primary = hsl(var(--sd-primary))
                        ↓
컴포넌트            className="bg-primary"
```

색을 바꿀 때는 hex 와 `--hsl-*` 를 함께 수정한다.

## 4. 새 컴포넌트 만드는 방법

```bash
cd services/keep-web/frontend
npx shadcn@latest add <component>   # components.json 설정을 따라 src/components/ui/ 에 생성된다
```

규칙 3가지.

1. **최상위에 `tw-root` 를 붙인다.** Tailwind 리셋과 토큰이 이 스코프에서만 동작한다.
   ```tsx
   <div className="tw-root space-y-4"> … </div>
   ```
2. **Radix 포털을 쓰는 컴포넌트는 자기 className 에 `tw-root` 를 넣는다.** Dialog / Select / DropdownMenu 의 Content 는 `document.body` 아래에 렌더되므로 부모 스코프를 상속받지 못한다. 이미 추가된 파일들(`dialog.tsx`, `select.tsx`, `dropdown-menu.tsx`)을 참고한다.
3. **커스텀 CSS 클래스와 Tailwind 유틸리티를 한 요소에 섞지 않는다.** 섞으면 어느 쪽이 이기는지 추적하기 어렵다. 컨테이너는 커스텀 CSS(`.page`, `.page-intro`), 그 안의 새 블록은 `tw-root` 로 분리한다.

## 5. 상태는 스토어로 공유한다

화면 간에 공유되는 상태는 `src/lib/*Store.ts` 에 두고 `useSyncExternalStore` + `localStorage` 로 구현했다. 페이지가 늘어도 동기화 문제가 생기지 않는다.

| 스토어 | 키 | 쓰는 곳 |
|---|---|---|
| `decisionStore` | `keep-on-decisions` | 저장 목록, 상세 결정, 홈, 캘린더, 알림 |
| `planStore` | `keep-on-plan` | 실행 계획, 캘린더, 챗, 알림 |
| `profileStore` | `keep-on-profile` | 프로필, 온보딩, 판정 인과, 알림 |
| `recentQueries` | `keep-on-recent-queries` | 저장 목록 검색 |
| 알림 읽음 | `keep-on-notices-read` | 앱 셸 알림 |

`agentApi.loadProfile()` 은 API 호출용으로 기본값을 채워 주므로, "무엇이 비어 있는지" 판단에는 `profileStore` 를 쓴다.

## 6. 이관 순서 제안

1. 저장 목록 행(`.opportunity-row`) → Card + Badge 조합. 목록/필터/빈 상태가 이미 shadcn 이라 이어 붙이기 쉽다.
2. 상세 화면 결정 카드(`.decision-card`) → Card + Button. 다크 배경이라 토큰(`--sd-*`) 대비값을 먼저 정해야 한다.
3. 앱 셸 알림 팝오버 → shadcn `DropdownMenu` 또는 `Popover`. 포털 규칙(2번) 주의.
4. 홈 레일 → 가로 스크롤은 Tailwind 로 충분하지만 `.home-page` 의 전체폭 배경 트릭(`clip-path`)은 유지가 필요하다.

## 7. 정리 상태 점검

미사용 CSS 클래스를 확인하는 방법.

```bash
cd services/keep-web/frontend
python3 - <<'PY'
import re, pathlib
css = pathlib.Path('src/index.css').read_text()
classes = sorted(set(re.findall(r'\.([a-zA-Z][\w-]*)', css)))
src = ''.join(p.read_text() for p in pathlib.Path('src').rglob('*.ts*'))
dyn = ['accent-', 'plan-tone-', 'opportunity-preview-', 'tone-', 'is-']
unused = [c for c in classes if c not in src and not any(c.startswith(d) for d in dyn) and c != 'woff2']
print(len(classes), '개 중 미사용', unused)
PY
```

캘린더를 shadcn 으로 옮긴 뒤 이 검사로 죽은 CSS 328줄을 찾아 제거했다(`index.css` 1968 → 1608줄, 빌드 CSS 94kB → 80kB). 화면을 이관할 때마다 같은 방식으로 정리한다.
