import { createPlatformAgent } from './agents/platform-agents.js';
import { PythonBridgeNormalizationAgent } from './agents/python-bridge-agent.js';
import { ValidationService } from './validation.js';

const MAX_ACTIVE_INTAKES_PER_USER = 2;

export async function processIntake(store, intakeId, session) {
  const { userId, accessToken } = session;
  const intake = await store.getIntake(intakeId, userId, accessToken);
  if (!intake || store.isCancelled(intakeId)) return;
  if (store.activeCount(intake.user_id) >= MAX_ACTIVE_INTAKES_PER_USER) {
    await store.updateIntake(intakeId, { status: 'QUEUED' }, userId, accessToken);
    setTimeout(() => processIntake(store, intakeId, session), 25);
    return;
  }

  store.enterActive(intake.user_id);
  try {
    await store.updateIntake(intakeId, { status: 'RECEIVED' }, userId, accessToken);
    if (store.isCancelled(intakeId)) return;
    await store.updateIntake(intakeId, { status: 'EXTRACTING' }, userId, accessToken);
    const agent = createPlatformAgent(intake.page_evidence.platform);
    if (!agent) {
      await store.updateIntake(intakeId, { status: 'UNSUPPORTED', error: { code: 'UNSUPPORTED_PLATFORM', message: 'Instagram 또는 Threads만 지원합니다.' } }, userId, accessToken);
      return;
    }
    const extracted = agent.extract(intake.page_evidence);
    if (store.isCancelled(intakeId)) return;
    await store.updateIntake(intakeId, { status: 'NORMALIZING' }, userId, accessToken);
    const normalized = await new PythonBridgeNormalizationAgent().normalize(extracted);
    if (store.isCancelled(intakeId)) return;
    await store.updateIntake(intakeId, { status: 'VALIDATING' }, userId, accessToken);
    const validation = new ValidationService().validate(normalized);
    const duplicate = await store.findOpportunityByCanonical(normalized.canonical_url, userId, accessToken);
    const opportunityData = {
      intake_id: intakeId,
      canonical_url: normalized.canonical_url,
      source_url: normalized.source_url,
      platform: normalized.platform,
      title: normalized.title || '정리가 필요한 저장 항목',
      summary: normalized.summary,
      body: normalized.body,
      author: normalized.author,
      published_at: normalized.published_at,
      category: normalized.category,
      deadline: normalized.deadline,
      links: normalized.links,
      evidence: normalized.evidence,
      confidence: normalized.confidence,
      normalization_method: normalized.normalization_method,
      content_category: normalized.content_category,
      conditions: normalized.conditions,
      status: validation.ok ? 'READY_FOR_REVIEW' : 'NEEDS_REVIEW',
      needs_review: !validation.ok,
      error_codes: validation.errors
    };
    const opportunity = duplicate
      ? await store.updateOpportunity(duplicate.id, opportunityData, userId, accessToken)
      : await store.createOpportunity(opportunityData, userId, accessToken);
    if (store.isCancelled(intakeId)) return;
    await store.updateIntake(intakeId, {
      status: validation.ok ? 'READY_FOR_REVIEW' : 'NEEDS_REVIEW',
      opportunity_id: opportunity.id,
      error: validation.ok ? null : { code: validation.errors[0], message: '근거를 더 확인해야 합니다.', details: validation.errors }
    }, userId, accessToken);
  } catch (error) {
    await store.updateIntake(intakeId, {
      status: 'FAILED',
      error: { code: 'WORKFLOW_FAILED', message: error instanceof Error ? error.message : String(error) }
    }, userId, accessToken);
  } finally {
    store.leaveActive(intake.user_id);
  }
}
