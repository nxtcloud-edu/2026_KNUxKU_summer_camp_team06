import { createIntakeId, createOpportunityId } from '../shared/contracts.js';

function now() {
  return new Date().toISOString();
}

export class InMemoryKeeperStore {
  constructor() {
    this.intakes = new Map();
    this.opportunities = new Map();
    this.canonicalToOpportunity = new Map();
    this.cancelledIntakes = new Set();
    this.sequence = 0;
    this.activeByUser = new Map();
  }

  createIntake(pageEvidence, userId = 'local-test-user') {
    this.sequence += 1;
    const id = createIntakeId(this.sequence);
    const intake = {
      id, user_id: userId, status: 'QUEUED', page_evidence: pageEvidence,
      opportunity_id: null, error: null, created_at: now(), updated_at: now()
    };
    this.intakes.set(id, intake);
    return intake;
  }

  getIntake(id, userId) {
    const intake = this.intakes.get(id) || null;
    return intake && (!userId || intake.user_id === userId) ? intake : null;
  }

  updateIntake(id, patch, userId) {
    const intake = this.getIntake(id, userId);
    if (!intake) return null;
    Object.assign(intake, patch, { updated_at: now() });
    return intake;
  }

  markCancelled(id, userId) {
    this.cancelledIntakes.add(id);
    return this.updateIntake(id, { status: 'CANCELLED' }, userId);
  }

  isCancelled(id) {
    return this.cancelledIntakes.has(id);
  }

  activeCount(userId) {
    return this.activeByUser.get(userId) || 0;
  }

  enterActive(userId) {
    this.activeByUser.set(userId, this.activeCount(userId) + 1);
  }

  leaveActive(userId) {
    const next = Math.max(0, this.activeCount(userId) - 1);
    if (next === 0) this.activeByUser.delete(userId);
    else this.activeByUser.set(userId, next);
  }

  findOpportunityByCanonical(canonicalUrl, userId) {
    const id = this.canonicalToOpportunity.get(userId + ':' + canonicalUrl);
    return id ? this.opportunities.get(id) || null : null;
  }

  createOpportunity(data, userId = 'local-test-user') {
    this.sequence += 1;
    const id = createOpportunityId(this.sequence);
    const opportunity = { id, user_id: userId, ...data, created_at: now(), updated_at: now() };
    this.opportunities.set(id, opportunity);
    this.canonicalToOpportunity.set(userId + ':' + data.canonical_url, id);
    return opportunity;
  }

  updateOpportunity(id, data, userId) {
    const opportunity = this.getOpportunity(id, userId);
    if (!opportunity) return null;
    Object.assign(opportunity, data, { updated_at: now() });
    return opportunity;
  }

  getOpportunity(id, userId) {
    const opportunity = this.opportunities.get(id) || null;
    return opportunity && (!userId || opportunity.user_id === userId) ? opportunity : null;
  }

  listOpportunities(userId = 'local-test-user') {
    return [...this.opportunities.values()]
      .filter((item) => item.user_id === userId && item.status !== 'DELETED')
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  deleteOpportunity(id, userId = 'local-test-user') {
    const opportunity = this.getOpportunity(id, userId);
    if (!opportunity) return false;
    opportunity.status = 'DELETED';
    opportunity.deleted_at = now();
    opportunity.updated_at = opportunity.deleted_at;
    this.canonicalToOpportunity.delete(userId + ':' + opportunity.canonical_url);
    return true;
  }
}

function asError(response, body) {
  const error = new Error((body && body.message) || 'Supabase request failed (' + response.status + ')');
  error.statusCode = response.status >= 500 ? 502 : response.status;
  return error;
}

export class SupabaseKeeperStore {
  constructor({ url, anonKey, fetchImpl = globalThis.fetch } = {}) {
    this.url = (url || '').replace(/\/$/, '');
    this.anonKey = anonKey;
    this.fetchImpl = fetchImpl;
    this.activeByUser = new Map();
    this.cancelledIntakes = new Set();
  }

  async request(path, accessToken, { method = 'GET', body, prefer = 'return=representation' } = {}) {
    const response = await this.fetchImpl(this.url + '/rest/v1/' + path, {
      method,
      headers: {
        apikey: this.anonKey,
        authorization: 'Bearer ' + accessToken,
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(prefer ? { prefer } : {})
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    if (!response.ok) {
      let errorBody = null;
      try { errorBody = await response.json(); } catch {}
      throw asError(response, errorBody);
    }
    if (response.status === 204) return null;
    return response.json();
  }

  async createIntake(pageEvidence, userId, accessToken) {
    const rows = await this.request('intakes', accessToken, {
      method: 'POST',
      body: { user_id: userId, status: 'QUEUED', page_evidence: pageEvidence }
    });
    return rows[0] || null;
  }

  async getIntake(id, userId, accessToken) {
    const query = new URLSearchParams({ select: '*', id: 'eq.' + id, user_id: 'eq.' + userId });
    const rows = await this.request('intakes?' + query, accessToken);
    return rows[0] || null;
  }

  async updateIntake(id, patch, userId, accessToken) {
    const query = new URLSearchParams({ id: 'eq.' + id, user_id: 'eq.' + userId });
    const rows = await this.request('intakes?' + query, accessToken, { method: 'PATCH', body: patch });
    return rows[0] || null;
  }

  async markCancelled(id, userId, accessToken) {
    this.cancelledIntakes.add(id);
    return this.updateIntake(id, { status: 'CANCELLED' }, userId, accessToken);
  }

  isCancelled(id) {
    return this.cancelledIntakes.has(id);
  }

  activeCount(userId) {
    return this.activeByUser.get(userId) || 0;
  }

  enterActive(userId) {
    this.activeByUser.set(userId, this.activeCount(userId) + 1);
  }

  leaveActive(userId) {
    const next = Math.max(0, this.activeCount(userId) - 1);
    if (next === 0) this.activeByUser.delete(userId);
    else this.activeByUser.set(userId, next);
  }

  async findOpportunityByCanonical(canonicalUrl, userId, accessToken) {
    const query = new URLSearchParams({
      select: '*', canonical_url: 'eq.' + canonicalUrl, user_id: 'eq.' + userId, limit: '1'
    });
    const rows = await this.request('opportunities?' + query, accessToken);
    return rows[0] || null;
  }

  async createOpportunity(data, userId, accessToken) {
    const rows = await this.request('opportunities', accessToken, {
      method: 'POST',
      body: { ...data, user_id: userId }
    });
    return rows[0] || null;
  }

  async updateOpportunity(id, data, userId, accessToken) {
    const query = new URLSearchParams({ id: 'eq.' + id, user_id: 'eq.' + userId });
    const rows = await this.request('opportunities?' + query, accessToken, { method: 'PATCH', body: data });
    return rows[0] || null;
  }

  async getOpportunity(id, userId, accessToken) {
    const query = new URLSearchParams({ select: '*', id: 'eq.' + id, user_id: 'eq.' + userId });
    const rows = await this.request('opportunities?' + query, accessToken);
    return rows[0] || null;
  }

  async listOpportunities(userId, accessToken) {
    const query = new URLSearchParams({
      select: '*', user_id: 'eq.' + userId, status: 'neq.DELETED', order: 'created_at.desc'
    });
    return this.request('opportunities?' + query, accessToken);
  }

  async deleteOpportunity(id, userId, accessToken) {
    const result = await this.updateOpportunity(id, { status: 'DELETED', deleted_at: now() }, userId, accessToken);
    return Boolean(result);
  }
}
