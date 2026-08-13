# 입력 원본과 저장 구조

사용자가 저장하는 방법은 다섯 가지다.

| source_type | 사용자 입력 | 원본 저장 위치 | 추출 방식 |
|---|---|---|---|
| extension | 현재 SNS 게시물 Keep | intakes.page_evidence | 현재 탭의 본문·캡션 증거 |
| link | URL 붙여넣기 | intakes.source_url | 서버의 공개 페이지 추출 |
| text | 텍스트 붙여넣기 | intakes.source_text | 입력 텍스트 그대로 |
| pdf | PDF 업로드 | private Storage + intake_files | PDF 텍스트 추출 |
| image | 사진·스크린샷 업로드 | private Storage + intake_files | Gemini OCR |

하나의 Intake는 하나의 대표 입력을 뜻한다. PDF·사진의 바이너리 원본을 Postgres에 넣지
않고 private Storage에 저장하며, DB에는 소유자, 경로, 파일명, MIME type, 용량, 추출 상태와
텍스트만 기록한다.

## 분류 두 종류

- category: Competition / Support / Benefit. 사용자 카드의 정보 성격 분류다.
- content_category: opportunity / time_sensitive_info / general_info. 자격 판정과 계획
  Agent로 어떤 항목을 보낼지 정하는 작업 흐름 분류다.

두 분류를 하나로 합치지 않는다. 예를 들어 대학생 할인은 category=Benefit이면서
content_category=general_info일 수 있다.

## 보안

- 원본 PDF·사진은 public URL을 만들지 않는다.
- Storage object path는 user_id/intake_id/uuid-filename 형식을 사용한다.
- 업로드·조회·수정·삭제는 Storage RLS로 해당 user_id만 허용한다.
- Gemini API key와 Supabase service-role key는 서버 .env에만 둔다.
- Extension, Web 코드, DB 행에는 비밀키를 저장하지 않는다.
