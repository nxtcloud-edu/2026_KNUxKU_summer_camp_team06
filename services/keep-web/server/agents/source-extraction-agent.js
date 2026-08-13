const MAX_FILE_BYTES = 15 * 1024 * 1024;

export class GeminiSourceExtractionAgent {
  constructor({ apiKey = process.env.GEMINI_API_KEY, model = process.env.GEMINI_MODEL || 'gemini-2.5-flash', fetchImpl = globalThis.fetch } = {}) {
    this.apiKey = apiKey;
    this.model = model;
    this.fetchImpl = fetchImpl;
  }

  async extract({ sourceType, sourceText, objectPath, mimeType }, store, accessToken) {
    if (sourceType === 'text') {
      const text = String(sourceText || '').trim();
      if (!text) throw new Error('정리할 텍스트가 없습니다.');
      return text;
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
