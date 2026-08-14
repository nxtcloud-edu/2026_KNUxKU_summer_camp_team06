// dDay 표시 문구를 한 곳에서 만든다. 이전에는 `D-${item.dDay}` 패턴이 App.tsx에 6곳,
// chatContext.ts에 1곳 복붙되어 있었는데 전부 음수(마감 지난 경우) 처리가 없어서
// "D--32" 같은 값이 그대로 노출됐다. dDay는 daysUntil()이 반환하는 정상적인 음수라
// 여기(표시 단계)에서만 고치면 된다.
export function formatDday(dDay: number | null): string {
  if (dDay === null) return '마감 정보 없음';
  if (dDay < 0) return '마감';
  if (dDay === 0) return '오늘 마감';
  return `D-${dDay}`;
}
