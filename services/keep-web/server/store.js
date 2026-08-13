import { createIntakeId, createOpportunityId } from '../shared/contracts.js';

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
      id,
      user_id: userId,
      status: 'QUEUED',
      page_evidence: pageEvidence,
      opportunity_id: null,
      error: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    this.intakes.set(id, intake);
    return intake;
  }

  getIntake(id) {
    return this.intakes.get(id) || null;
  }

  updateIntake(id, patch) {
    const intake = this.intakes.get(id);
    if (!intake) return null;
    Object.assign(intake, patch, { updated_at: new Date().toISOString() });
    return intake;
  }

  markCancelled(id) {
    this.cancelledIntakes.add(id);
    return this.updateIntake(id, { status: 'CANCELLED' });
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
    const id = this.canonicalToOpportunity.get(`${userId}:${canonicalUrl}`);
    return id ? this.opportunities.get(id) || null : null;
  }

  createOpportunity(data, userId = 'local-test-user') {
    this.sequence += 1;
    const id = createOpportunityId(this.sequence);
    const opportunity = {
      id,
      user_id: userId,
      ...data,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    this.opportunities.set(id, opportunity);
    this.canonicalToOpportunity.set(`${userId}:${data.canonical_url}`, id);
    return opportunity;
  }

  updateOpportunity(id, data) {
    const opportunity = this.opportunities.get(id);
    if (!opportunity) return null;
    Object.assign(opportunity, data, { updated_at: new Date().toISOString() });
    return opportunity;
  }

  getOpportunity(id) {
    return this.opportunities.get(id) || null;
  }

  listOpportunities(userId = 'local-test-user') {
    return [...this.opportunities.values()]
      .filter((item) => item.user_id === userId && item.status !== 'DELETED')
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  deleteOpportunity(id, userId = 'local-test-user') {
    const opportunity = this.opportunities.get(id);
    if (!opportunity || opportunity.user_id !== userId) return false;
    opportunity.status = 'DELETED';
    opportunity.deleted_at = new Date().toISOString();
    opportunity.updated_at = opportunity.deleted_at;
    this.canonicalToOpportunity.delete(`${userId}:${opportunity.canonical_url}`);
    return true;
  }
}
