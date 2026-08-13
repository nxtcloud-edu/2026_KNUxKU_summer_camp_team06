function bearerToken(headers) {
  const header = headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

export class SupabaseAuthService {
  constructor({ url, anonKey, fetchImpl = globalThis.fetch } = {}) {
    this.url = (url || '').replace(/\/$/, '');
    this.anonKey = anonKey;
    this.fetchImpl = fetchImpl;
  }

  async authenticate(headers) {
    const accessToken = bearerToken(headers);
    if (!accessToken) return null;
    const response = await this.fetchImpl(this.url + '/auth/v1/user', {
      headers: { apikey: this.anonKey, authorization: 'Bearer ' + accessToken }
    });
    if (!response.ok) return null;
    const user = await response.json();
    return user && user.id ? { userId: user.id, accessToken, email: user.email || null } : null;
  }
}
