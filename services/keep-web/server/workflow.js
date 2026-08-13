import { createPlatformAgent } from './agents/platform-agents.js';
import { NormalizationAgent } from './agents/normalization-agent.js';
import { ValidationService } from './validation.js';

const MAX_ACTIVE_INTAKES_PER_USER = 2;

export function processIntake(store, intakeId) {
  const intake = store.getIntake(intakeId);
  if (!intake || store.isCancelled(intakeId)) return;
  if (store.activeCount(intake.user_id) >= MAX_ACTIVE_INTAKES_PER_USER) {
    store.updateIntake(intakeId, { status: 'QUEUED' });
    setTimeout(() => processIntake(store, intakeId), 25);
    return;
  }

  store.enterActive(intake.user_id);
  try {
    store.updateIntake(intakeId, { status: 'RECEIVED' });
    if (store.isCancelled(intakeId)) return;
    store.updateIntake(intakeId, { status: 'EXTRACTING' });
    const agent = createPlatformAgent(intake.page_evidence.platform);
    if (!agent) {
      store.updateIntake(intakeId, { status: 'UNSUPPORTED', error: { code: 'UNSUPPORTED_PLATFORM', message: 'Instagram 또는 Threads만 지원합니다.' } });
      return;
    }
    const extracted = agent.extract(intake.page_evidence);
    if (store.isCancelled(intakeId)) return;
    store.updateIntake(intakeId, { status: 'NORMALIZING' });
    const normalized = new NormalizationAgent().normalize(extracted);
    if (store.isCancelled(intakeId)) return;
    store.updateIntake(intakeId, { status: 'VALIDATING' });
    const validation = new ValidationService().validate(normalized);
    const duplicate = store.findOpportunityByCanonical(normalized.canonical_url, intake.user_id);
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
      status: validation.ok ? 'READY_FOR_REVIEW' : 'NEEDS_REVIEW',
      needs_review: !validation.ok,
      error_codes: validation.errors
    };
    const opportunity = duplicate
      ? store.updateOpportunity(duplicate.id, opportunityData)
      : store.createOpportunity(opportunityData, intake.user_id);
    if (store.isCancelled(intakeId)) return;
    store.updateIntake(intakeId, {
      status: validation.ok ? 'READY_FOR_REVIEW' : 'NEEDS_REVIEW',
      opportunity_id: opportunity.id,
      error: validation.ok ? null : { code: validation.errors[0], message: '근거를 더 확인해야 합니다.', details: validation.errors }
    });
  } catch (error) {
    store.updateIntake(intakeId, {
      status: 'FAILED',
      error: { code: 'WORKFLOW_FAILED', message: error instanceof Error ? error.message : String(error) }
    });
  } finally {
    store.leaveActive(intake.user_id);
  }
}
