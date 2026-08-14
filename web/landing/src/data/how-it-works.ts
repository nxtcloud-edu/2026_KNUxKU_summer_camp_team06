// 실제로 src/normalization_agent.py + src/execution 파이프라인을 돌려서 나온 진짜 결과.
// (docs/landingpage.md의 "멋쟁이사자처럼 백엔드 부트캠프" 공고 + 페르소나 김서연 기준)
export const demoRawText =
  '[마감임박] 백엔드 개발자로 성장하는 6개월 커리큘럼, 지금 바로 멋사에서 시작하세요!\n' +
  '내일배움카드 소지 시 교육비 최대 100% 지원, 매월 최대 90만 원 훈련장려금 지급\n' +
  '모집 일정: ~ 2026/08/17(월) 23시\n' +
  '교육 일정: 2026/08/19(수) ~ 2027/01/28(목)'

export const demoConditions = [
  { type: 'status', quote: '내일배움카드 소지 시 교육비 최대 100% 지원' },
  { type: 'period', quote: '2026/08/17(월) 23시 (모집 마감)' },
  { type: 'period', quote: '2026/08/19(수) ~ 2027/01/28(목) (교육 기간)' },
]

export const demoTasks = [
  { title: '국민내일배움카드 발급 자격 및 필요 서류 확인', due: '08/13' },
  { title: 'HRD-Net 국민내일배움카드 발급 신청', due: '08/14' },
  { title: '부트캠프 지원 동기 및 학습 계획서 작성', due: '08/16' },
  { title: '멋쟁이사자처럼 공식 홈페이지 지원서 제출', due: '08/17' },
  { title: 'HRD-Net 훈련과정 수강신청 및 최종 접수 완료', due: '08/17' },
]
