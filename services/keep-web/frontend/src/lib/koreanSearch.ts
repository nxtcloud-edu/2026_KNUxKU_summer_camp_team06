/**
 * 한국어 검색 매칭.
 * 문자열 포함 비교만 쓰면 '클라우드캠퍼스'(붙여쓰기)나 'ㅋㄹㄷ'(초성)으로는 아무것도 찾지 못한다.
 * 1) 공백·기호를 무시한 포함 검색
 * 2) 초성만 입력한 경우 초성 검색
 * 3) 자모 단위 부분 검색 ('클라우ㄷ' 처럼 조립 중인 입력)
 */

const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;

const CHOSEONG = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
];

const JUNGSEONG = [
  'ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ',
  'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ',
];

const JONGSEONG = [
  '', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ',
  'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
];

const CHOSEONG_ONLY = /^[ㄱ-ㅎ]+$/;

const isSyllable = (code: number) => code >= HANGUL_BASE && code <= HANGUL_LAST;

/** 공백과 구분 기호를 지우고 소문자로 맞춘다. */
export function normalizeQuery(text: string) {
  return text.toLowerCase().replace(/[\s·,./\-_()[\]]/g, '');
}

/** 각 음절의 초성만 남긴다. 한글이 아니면 그대로 둔다. */
export function toChoseong(text: string) {
  let out = '';
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (isSyllable(code)) {
      out += CHOSEONG[Math.floor((code - HANGUL_BASE) / 588)];
    } else {
      out += char;
    }
  }
  return out;
}

/** 음절을 초성·중성·종성으로 펼친다. */
export function toJamo(text: string) {
  let out = '';
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (isSyllable(code)) {
      const offset = code - HANGUL_BASE;
      out += CHOSEONG[Math.floor(offset / 588)];
      out += JUNGSEONG[Math.floor((offset % 588) / 28)];
      out += JONGSEONG[offset % 28];
    } else {
      out += char;
    }
  }
  return out;
}

export const isChoseongQuery = (query: string) => CHOSEONG_ONLY.test(query.replace(/\s/g, ''));

const tokenize = (text: string) =>
  text
    .toLowerCase()
    .split(/[\s·,./\-_()[\]]+/)
    .filter(Boolean);

/**
 * '클라우드캠퍼스' 처럼 여러 단어의 앞부분을 붙여 쓴 검색어를 찾는다.
 * 검색어를 순서대로 잘라 각 조각이 어떤 토큰의 접두어가 되면 통과한다. (토큰 건너뛰기 허용)
 */
function matchesTokenChain(tokens: string[], query: string, from = 0): boolean {
  if (!query) return true;
  for (let index = from; index < tokens.length; index += 1) {
    const token = tokens[index];
    let shared = 0;
    while (shared < token.length && shared < query.length && token[shared] === query[shared]) {
      shared += 1;
    }
    for (let length = shared; length >= 1; length -= 1) {
      if (matchesTokenChain(tokens, query.slice(length), index + 1)) return true;
    }
  }
  return false;
}

/** 한 필드와 검색어를 비교한다. */
export function matchesKorean(text: string, query: string) {
  const q = normalizeQuery(query);
  if (!q) return true;
  const t = normalizeQuery(text);
  if (t.includes(q)) return true;
  if (isChoseongQuery(q) && toChoseong(t).includes(q)) return true;
  if (toJamo(t).includes(toJamo(q))) return true;
  return matchesTokenChain(tokenize(text), q);
}

/** 여러 필드 중 하나라도 맞으면 통과 */
export function matchesAnyField(fields: Array<string | undefined>, query: string) {
  if (!normalizeQuery(query)) return true;
  return fields.some((field) => (field ? matchesKorean(field, query) : false));
}
