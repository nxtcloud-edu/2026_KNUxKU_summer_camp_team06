# KEEP:ON Node 서비스

이 폴더는 KEEP:ON의 Node.js + Chrome Extension + HTTP Web 로컬 수직 슬라이스입니다.
상위 레포의 [README](../../README.md), [Project](../../Project.md),
[ARCHITECTURE](../../ARCHITECTURE.md)를 먼저 읽습니다.

## 실행

~~~bash
npm test
npm start
~~~

Chrome에서 \`chrome://extensions\`를 열고 개발자 모드를 켠 뒤 이 폴더의
\`extension/\`을 압축해제된 확장 프로그램으로 로드합니다.

서버가 실행되면 다음 fixture에서 로그인 없이 Keep을 재현할 수 있습니다.

- http://localhost:4173/fixtures/instagram.html
- http://localhost:4173/fixtures/threads.html

실제 SNS 게시물은 로그인된 Chrome 프로필에서 테스트합니다. 코드 수정 후에는
Extension과 SNS 페이지를 함께 새로고침합니다.

## API

프론트는 Agent나 저장소 파일을 직접 import하지 않고 HTTP API만 사용합니다.

| 목적 | 메서드 | 경로 |
|---|---|---|
| 저장 요청 | POST | \`/v1/intakes\` |
| 처리 상태 | GET | \`/v1/intakes/:id\` |
| 저장 목록 | GET | \`/v1/opportunities\` |
| 저장 상세 | GET | \`/v1/opportunities/:id\` |
| 사용자 확인 | POST | \`/v1/opportunities/:id/confirm\` |
| 저장 삭제 | DELETE | \`/v1/opportunities/:id\` |

목록 응답은 \`{ "items": [...] }\`이고, 카드 필드는 \`title\`, \`body\`/\`summary\`,
\`deadline\`(null 가능), \`canonical_url\`, \`source_url\`, \`links\`, \`platform\`,
\`category\`, \`status\`, \`needs_review\`입니다.

## 코드 경계

- \`extension/\`: 현재 탭 증거 수집 및 Keep
- \`server/\`: HTTP API, 상태 전이, 저장, Agent 실행
- \`server/agents/\`: 플랫폼 Extraction과 Normalization
- \`shared/contracts.js\`: 입력·출력 계약
- \`web/\`: HTTP API를 사용하는 기본 대시보드
- \`tests/\`: 계약·Extension·HTTP 통합 테스트

현재 저장소는 메모리 기반이며 사용자 인증·운영 DB·Planning·Calendar·Notification은
후속 단계입니다. 마감일은 선택값이고 본문 근거가 없으면 \`null\`로 저장합니다.
