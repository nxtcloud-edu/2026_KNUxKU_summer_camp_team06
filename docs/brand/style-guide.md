# KEEP:ON 브랜드 가이드 (v0.1 — 시안)

E(프론트엔드) 작업 시 그대로 가져다 쓸 수 있게 정리한 로고/컬러/타입 스펙입니다.
전체 컨셉과 프로토타입 미리보기는 Artifact 링크 참고 — 이 문서는 실제 구현용 스펙입니다.

## 컨셉 한 줄

**저장(Keep) → 진행(On)** 을 콜론(`:`) 하나로 표현합니다. 아이콘의 두 점은 실제로
`KEEP:ON`이라는 이름 안에 있는 콜론을 확대한 것입니다 — 위 점(●)은 "저장해서 붙잡아둔
상태", 아래 도넛+진행 아크는 "마감까지 카운트다운이 돌고 있는 상태"를 나타냅니다.
국내 대학생에게 익숙한 **D-day 카운트다운 링** 어휘를 그대로 아이콘 문법으로 가져왔습니다.

## 파일 목록

| 파일 | 용도 |
|---|---|
| `logo-icon.svg` | 기본 아이콘 (투명 배경, 브랜드 컬러). 웹앱 헤더/인앱 사용 |
| `logo-icon-mono.svg` | 단색 버전 (`currentColor` 상속) — 워터마크, 다크모드, 임의 배경 위 사용 |
| `favicon.svg` | 브라우저 탭 파비콘 / Chrome Extension 아이콘용 (다크 배지 배경 포함) |
| `logo-lockup-horizontal.svg` | 아이콘+워드마크 가로 조합 — 헤더, 문서 표지용 |
| `logo-lockup-stacked.svg` | 아이콘+워드마크 세로 조합 — 정사각형 영역(소셜 카드, 스플래시)용 |

**주의**: lockup SVG 2개는 시스템 폰트로 렌더링되는 문서/데크용 미리보기 자산입니다.
실제 웹앱의 워드마크는 이미지가 아니라 **아래 CSS 스펙으로 직접 구현**하세요 (다크모드
대응, 스크린리더 접근성, 임의 크기 대응이 다 됩니다).

## 컬러 토큰

| 이름 | 라이트 | 다크 | 역할 |
|---|---|---|---|
| `--ink` | `#1C1B2E` | `#F1EFE6` | 본문 텍스트 |
| `--ink-soft` | `#55577A` | `#B7B9D9` | 보조 텍스트 |
| `--keep` (브랜드 블루) | `#2A4A9B` | `#7B97DE` | "Keep" — 저장/신뢰, 아이콘 위쪽 점 |
| `--on` (브랜드 앰버) | `#F5A623` | `#FFC369` | "On" — 진행/마감 임박, 아이콘 아래 아크 |
| `--on-text` (텍스트용 앰버) | `#B8720A` | `#FFC369` | 앰버를 텍스트에 쓸 때 (라이트 배경 대비 확보) |
| `--paper` (배경) | `#F4F5FA` | `#14152A` | 페이지 배경 |
| `--surface` (카드) | `#FFFFFF` | `#1D1F3A` | 카드/패널 배경 |
| `--line` (구분선) | `#D8DCE8` | `#33355A` | 테두리, 아이콘 진행 링의 트랙 |

`--on`(#F5A623)은 밝은 색이라 라이트 배경 위 **텍스트**로는 대비가 부족합니다.
아이콘/그래픽 요소에만 쓰고, 글자색이 필요하면 반드시 `--on-text`를 쓰세요.

## 타이포그래피

| 역할 | 폰트 | 굵기 | 용도 |
|---|---|---|---|
| 디스플레이 (워드마크/헤드라인) | Archivo Black | 400(단일 굵기) | "KEEP:ON", 큰 제목 |
| 본문/UI | Manrope | 400 / 500 / 700 / 800 | 본문, 버튼, 라벨 |
| 유틸리티 (숫자/D-day/타임스탬프) | IBM Plex Mono | 400 / 600 | "D-3", 날짜, 진행률 %, 코드 |

한글은 세 폰트 다 한글 글리프가 없으므로 자동으로 다음 순번(시스템 한글 폰트)으로
폴백됩니다 — `font-family` 마지막에 `"Apple SD Gothic Neo", "Malgun Gothic", sans-serif`를
꼭 붙이세요. 웹폰트 파일은 Google Fonts에서 받은 latin 서브셋(Archivo Black, Manrope
variable, IBM Plex Mono 400/600)이며, 실제 서비스에 넣을 땐 `self-host`(직접 호스팅)를
권장합니다 — Google Fonts CDN 직접 링크는 CSP/성능상 피하는 게 좋습니다.

## 워드마크 구현 (실제 앱에 쓸 코드)

이미지 대신 실제 텍스트로 구현하세요 — 다크모드/크기 대응이 훨씬 쉽고 접근성도 챙겨집니다.

```html
<span class="logo-wordmark">KEEP<span class="logo-colon">:</span>ON</span>
```

```css
.logo-wordmark {
  font-family: "Archivo Black", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
  font-size: 1.5rem;
  letter-spacing: 0.01em;
  color: var(--ink);
}
.logo-colon {
  color: var(--on);
}
```

## 아이콘 사용 규칙

- **최소 크기**: 16px (파비콘). 그 이하에서는 아이콘 대신 워드마크만 사용.
- **여백**: 아이콘 바깥으로 아이콘 지름의 최소 20% 여백 확보.
- **배경**: `logo-icon.svg`는 밝은 배경 전용(파란 점의 대비 확보). 어두운 배경/사진
  위에는 `logo-icon-mono.svg`(currentColor: 흰색 지정) 또는 `favicon.svg`(자체 다크
  배지 포함) 사용.
- **파비콘/Extension 아이콘 적용**:
  ```html
  <link rel="icon" href="/brand/favicon.svg" type="image/svg+xml" />
  ```
  Chrome Extension은 SVG를 직접 못 쓰므로 `favicon.svg`를 16/32/48/128px PNG로
  내보내서 `manifest.json`의 `icons`에 등록하세요.

## 하지 말 것

- 진행 아크(앰버) 색을 브랜드 블루로 바꾸지 않는다 — Keep(정적/신뢰)과 On(동적/마감)의
  색 구분이 이 아이덴티티의 핵심입니다.
- 아이콘을 좌우 비대칭으로 늘리지 않는다 (항상 1:1 비율 유지).
- 워드마크 콜론을 일반 텍스트 색으로 바꾸지 않는다 — 콜론이 색을 갖는 게 아이콘과의
  연결고리입니다.
- 아이콘 단독으로 쓸 때 링/트랙 없이 아크만 쓰지 않는다 (진행률 메타포가 깨짐).
