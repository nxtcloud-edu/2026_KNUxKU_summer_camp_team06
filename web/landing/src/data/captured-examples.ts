// 실제로 청년들이 SNS/카톡에서 저장하는 콘텐츠 예시 (docs/landingpage.md 기반, 축약).
// normalization_agent.py의 content_category 3분류를 그대로 반영한다.
export type ContentCategory = 'opportunity' | 'time_sensitive_info' | 'general_info'

export interface CapturedExample {
  platform: 'threads' | 'instagram' | 'kakaotalk'
  handle: string
  snippet: string
  category: ContentCategory
  keepOnNote: string
}

export const categoryLabel: Record<ContentCategory, string> = {
  opportunity: '지원 가능한 공고',
  time_sensitive_info: '마감 있는 정보',
  general_info: '정보성 콘텐츠',
}

export const categoryColor: Record<ContentCategory, string> = {
  opportunity: 'bg-primary text-primary-foreground',
  time_sensitive_info: 'bg-accent text-accent-foreground',
  general_info: 'bg-secondary text-secondary-foreground',
}

export const capturedExamples: CapturedExample[] = [
  {
    platform: 'kakaotalk',
    handle: '멋쟁이사자처럼',
    snippet:
      '[마감임박] 백엔드 개발자 6개월 커리큘럼, 내일배움카드 소지 시 교육비 최대 100% 지원 · 모집 ~8/17(월) 23시...',
    category: 'opportunity',
    keepOnNote: '지원자격 · 신청기간 자동 추출 → 판정 후 실행 계획까지 생성',
  },
  {
    platform: 'instagram',
    handle: '@housearchive_kr',
    snippet:
      '집덕후들의 커뮤니티 라이프, ‘하우스 아카이브’ OPEN 🎉 8.13(목)–8.16(일) · COEX · 티켓 12,000원→10,000원...',
    category: 'time_sensitive_info',
    keepOnNote: '자격조건 없음, 관람기간만 인식 → 마감 전 캘린더 알림',
  },
  {
    platform: 'threads',
    handle: '@heyproject7',
    snippet:
      '내가 제일 많이 쓰는 툴이 오픈디자인인데... 로컬 LLM 연결해서 도는 디자인 스튜디오야. 앱 화면, 웹사이트, 피치덱까지 다 돼...',
    category: 'general_info',
    keepOnNote: '마감·조건 없음 → “나중에 해볼래?” 리스트에 저장',
  },
  {
    platform: 'threads',
    handle: '@choi.openai',
    snippet:
      'Perplexity Pro, 5월 31일 마감... 미루다가 6월 되는 순간 아쉬워서 후회할 이벤트입니다...',
    category: 'time_sensitive_info',
    keepOnNote: '정확한 마감일만 인식 → 놓치기 전에 리마인드',
  },
  {
    platform: 'threads',
    handle: '@choi.openai',
    snippet:
      '학교 메일 인증만 하면 Cursor Pro 12개월 무료! 대학생이라면 꼭 챙겨야 할 혜택...',
    category: 'opportunity',
    keepOnNote: '‘학생 인증’ 조건 추출 → 자격 확인 후 신청 리마인드',
  },
  {
    platform: 'threads',
    handle: '@choi.openai',
    snippet:
      'Higgsfield 플러그인이 ChatGPT 앱에 정식 출시... API 키도 탭 전환도 없이 채팅으로 바로 결과가 나옵니다...',
    category: 'general_info',
    keepOnNote: '정보성 콘텐츠로 분류 → 판정 없이 아카이브',
  },
]
