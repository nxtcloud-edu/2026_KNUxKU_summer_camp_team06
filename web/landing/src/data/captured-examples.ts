import type { Platform } from '@/components/platform-icon'

// 실제로 청년들이 SNS/카톡에서 저장하는 콘텐츠 예시 (docs/landingpage.md 기반, 축약).
// normalization_agent.py의 content_category 3분류 로직과 맞춰서 구성했다(라벨은 UI에
// 노출하지 않고, keepOnNote로 결과만 자연스럽게 설명).
export type ContentCategory = 'opportunity' | 'time_sensitive_info' | 'general_info'
export type CoverTheme = 'house' | 'code' | 'card' | 'chat'

export interface CapturedExample {
  platform: Platform
  handle: string
  snippet: string
  category: ContentCategory
  keepOnNote: string
  cover?: CoverTheme
}

export const capturedExamples: CapturedExample[] = [
  {
    platform: 'kakaotalk',
    handle: '멋쟁이사자처럼',
    snippet:
      '[마감임박] 백엔드 개발자 6개월 커리큘럼, 내일배움카드 소지 시 교육비 최대 100% 지원 · 모집 ~8/17(월) 23시...',
    category: 'opportunity',
    keepOnNote: '지원자격 · 신청기간을 원문 그대로 뽑아 판정 후 실행 계획까지 만들어요',
    cover: 'code',
  },
  {
    platform: 'instagram',
    handle: '@housearchive_kr',
    snippet:
      '집덕후들의 커뮤니티 라이프, ‘하우스 아카이브’ OPEN 🎉 8.13(목)–8.16(일) · COEX · 티켓 12,000원→10,000원...',
    category: 'time_sensitive_info',
    keepOnNote: '자격조건은 없지만 관람기간을 인식해 마감 전 캘린더로 알려드려요',
    cover: 'house',
  },
  {
    platform: 'naver_blog',
    handle: '모두의카드',
    snippet:
      '지금부터~9월까지, 안 쓰면 손해! 더 커진 K-패스 환급 혜택 총정리, 모바일티머니 추가 10% 적립까지...',
    category: 'time_sensitive_info',
    keepOnNote: '혜택 종료 시점만 조용히 캘린더에 챙겨둬요',
    cover: 'card',
  },
  {
    platform: 'threads',
    handle: '@heyproject7',
    snippet:
      '내가 제일 많이 쓰는 툴이 오픈디자인인데... 로컬 LLM 연결해서 도는 디자인 스튜디오야. 앱 화면, 웹사이트, 피치덱까지 다 돼...',
    category: 'general_info',
    keepOnNote: '마감·조건이 없는 글이라 “나중에 해볼래?” 리스트에 조용히 저장해요',
  },
  {
    platform: 'threads',
    handle: '@choi.openai',
    snippet: 'Perplexity Pro, 5월 31일 마감... 미루다가 6월 되는 순간 아쉬워서 후회할 이벤트입니다...',
    category: 'time_sensitive_info',
    keepOnNote: '정확한 마감일만 인식해서 놓치기 전에 리마인드해요',
  },
  {
    platform: 'threads',
    handle: '@choi.openai',
    snippet: '학교 메일 인증만 하면 Cursor Pro 12개월 무료! 대학생이라면 꼭 챙겨야 할 혜택...',
    category: 'opportunity',
    keepOnNote: '‘학생 인증’ 조건을 뽑아서 자격 확인 후 신청을 도와줘요',
  },
  {
    platform: 'kakaotalk',
    handle: 'B.D.A.I 학회',
    snippet:
      '누적 8,000명 이상의 학회원과 함께하는 AI·빅데이터 실무 학회, 전공 무관 · 초보자 참여 가능 · 오픈카톡방 입장...',
    category: 'opportunity',
    keepOnNote: '전공 무관 조건까지 확인해서 지원할지 말지 바로 판단하게 해줘요',
    cover: 'chat',
  },
  {
    platform: 'threads',
    handle: '@choi.openai',
    snippet:
      'Higgsfield 플러그인이 ChatGPT 앱에 정식 출시... API 키도 탭 전환도 없이 채팅으로 바로 결과가 나옵니다...',
    category: 'general_info',
    keepOnNote: '판정 없이 정보성 콘텐츠로 분류해서 아카이브만 해둬요',
  },
]
