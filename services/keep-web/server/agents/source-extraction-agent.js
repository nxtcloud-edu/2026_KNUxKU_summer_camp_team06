const MAX_FILE_BYTES = 15 * 1024 * 1024;

function assertSafeLink(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('올바른 웹사이트 링크를 입력해 주세요.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('http 또는 https 링크만 저장할 수 있습니다.');
  if (/^(?:localhost|127\.|0\.0\.0\.0|\[::1\])$/i.test(url.hostname) || /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[0-1])\.)/.test(url.hostname)) {
    throw new Error('내부 주소는 저장할 수 없습니다.');
  }
  return url;
}

function htmlToText(html, sourceUrl) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '';
  const description = html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)["']/i)?.[1] || '';
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ').trim();
  return `원문 링크: ${sourceUrl}\n제목: ${title.replace(/\s+/g, ' ').trim()}\n요약: ${description.replace(/\s+/g, ' ').trim()}\n본문: ${text}`.slice(0, 12000);
}

export class GeminiSourceExtractionAgent {
  constructor({ apiKey = process.env.GEMINI_API_KEY, model = process.env.GEMINI_MODEL || 'gemini-2.5-flash', fetchImpl = globalThis.fetch } = {}) {
    this.apiKey = apiKey;
    this.model = model;
    this.fetchImpl = fetchImpl;
  }

  async extract({ sourceType, sourceText, sourceUrl, objectPath, mimeType }, store, accessToken) {
    if (sourceType === 'text') {
      const text = String(sourceText || '').trim();
      if (!text) throw new Error('정리할 텍스트가 없습니다.');
      return text;
    }
    if (sourceType === 'link') {
      const url = assertSafeLink(sourceUrl);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      try {
        const response = await this.fetchImpl(url, { headers: { 'user-agent': 'KEEP-ON/1.0' }, signal: controller.signal, redirect: 'follow' });
        if (!response.ok) throw new Error(`링크 페이지를 읽지 못했습니다. (${response.status})`);
        const html = await response.text();
        const text = htmlToText(html, url.href);
        if (text.length < 40) throw new Error('링크 페이지에서 정리할 본문을 찾지 못했습니다.');
        return text;
      } finally { clearTimeout(timer); }
    }
    if (!this.apiKey) throw new Error('Gemini 파일 분석 설정이 없습니다.');
    const bytes = await store.downloadUpload(objectPath, accessToken);
    if (!bytes.length || bytes.length > MAX_FILE_BYTES) throw new Error('파일은 15MB 이하만 분석할 수 있습니다.');
    const response = await this.fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`,
      {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [
            { inlineData: { mimeType, data: bytes.toString('base64') } },
            { text: '이 파일에 있는 한국어와 영어 정보를 빠짐없이 텍스트로 전사하세요. 이미지/PDF의 표·일정·링크·조건도 포함하세요. 요약이나 추측은 하지 말고 전사문만 반환하세요.' }
          ] }]
        })
      }
    );
    if (!response.ok) throw new Error(`Gemini 파일 분석에 실패했습니다. (${response.status})`);
    const payload = await response.json();
    const text = (payload.candidates?.[0]?.content?.parts || []).map((part) => part.text || '').join('').trim();
    if (!text) throw new Error('Gemini가 파일에서 텍스트를 찾지 못했습니다.');
    return text.slice(0, 12000);
  }
}
