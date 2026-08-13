# Supabase 개인화 저장소 설정

## 비밀키 경계

다음 값은 서버의 로컬 .env에만 둡니다. GitHub, Chrome Extension, Web JavaScript,
화면 캡처, 로그에 넣지 않습니다.

- GEMINI_API_KEY
- SUPABASE_SERVICE_ROLE_KEY

SUPABASE_ANON_KEY는 공개 클라이언트용 키이지만, 현재 구조에서는 Extension과 Web이
직접 DB를 호출하지 않습니다. Node API만 데이터 흐름을 관리합니다.

## 1. Supabase 프로젝트 생성

1. Supabase Dashboard에서 새 프로젝트를 만든다.
2. Project URL과 API Keys의 anon key, service_role key를 확인한다.
3. services/keep-web/.env에 아래 항목을 직접 입력한다.

~~~env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
~~~

.env는 이미 Git ignore 대상이다. service_role key는 복사·공유·프론트 전달을 금지한다.

## 2. Google 로그인 설정

1. Supabase Dashboard → Authentication → Providers → Google을 활성화한다.
2. Google Cloud Console에서 만든 OAuth Client ID와 Client Secret을 Supabase에 입력한다.
3. Supabase Authentication URL Configuration에 개발 주소를 추가한다.

~~~text
http://localhost:4173
http://localhost:4173/auth/callback
~~~

Extension 인증을 구현할 때는 Chrome이 만든 chromiumapp.org redirect URL도 Supabase의
허용 Redirect URLs에 추가한다. Extension의 실제 ID가 확정된 뒤에만 추가한다.

## 3. DB와 RLS 적용

Supabase Dashboard → SQL Editor에서 아래 파일 내용을 실행한다.

../../supabase/migrations/202608130001_personal_keeper.sql

이 마이그레이션은 profiles, intakes, opportunities 테이블과 사용자별 Row Level
Security 정책을 만든다. 로그인한 사용자의 auth.uid()가 자신의 user_id와 같을 때만
조회·삽입·수정·삭제할 수 있다.

## 4. 적용 확인

1. Dashboard Table Editor에 세 테이블이 보이는지 확인한다.
2. Authentication → Users에서 테스트 Google 계정으로 로그인한다.
3. 다른 계정으로 로그인했을 때 첫 계정의 Opportunity가 보이지 않는지 확인한다.

프로젝트 URL과 키가 .env에 입력된 뒤 Node API 인증·DB 저장 연결을 진행한다.
