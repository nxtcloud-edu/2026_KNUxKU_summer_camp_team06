# KEEP:ON 랜딩페이지

Vite + React + TypeScript + Tailwind CSS v4 + shadcn(radix-nova preset).
서비스 대시보드(`services/keep-web/`)와는 별개의, 마케팅/소개용 랜딩페이지입니다.

## 실행

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ 로 프로덕션 빌드
```

## 구조

```
src/
  components/ui/
    card.tsx                    # shadcn 기본 Card
    avatar.tsx                  # shadcn 기본 Avatar (@radix-ui/react-avatar)
    3d-testimonails.tsx         # Marquee 컴포넌트 (3D perspective 후기 캐러셀)
    3d-testimonails-demo.tsx    # 위 컴포넌트 사용 예시 (플레이스홀더 데이터)
  lib/utils.ts                  # cn() 헬퍼 (clsx + tailwind-merge)
  App.tsx                       # 랜딩페이지 본체 — 지금은 플레이스홀더 카피/데이터
  index.css                     # Tailwind v4 + shadcn 테마 토큰(neutral) + marquee keyframes
```

`components.json`의 별칭이 `@/components/ui`, `@/lib/utils`로 설정되어 있어서, 앞으로
shadcn 컴포넌트를 추가할 때 (`npx shadcn@latest add <component>` 또는 수동 복사) 이
구조를 그대로 따르면 됩니다.

## 지금 상태 — 플레이스홀더

- `App.tsx`의 히어로 카피는 `Project.md`의 서비스 한 줄 정의를 임시로 넣어둔 것입니다.
- 후기(testimonials) 섹션은 컴포넌트 배선 확인용 가짜 데이터입니다.
- 실제 카피/로고/스크린샷/후기 자료가 오면 교체 예정입니다.

## 알려진 이슈: npm 캐시 권한

이 머신의 `~/.npm` 캐시 일부가 `root` 소유로 되어 있어(과거 `sudo npm install -g` 이력
추정) `npm install`이 `EACCES`로 실패할 수 있습니다. 겪으면:

```bash
sudo chown -R $(whoami) ~/.npm
```

으로 영구 해결하거나, 임시로 다른 캐시 경로를 지정해서 우회할 수 있습니다:

```bash
npm --cache /tmp/npm-cache install
```
