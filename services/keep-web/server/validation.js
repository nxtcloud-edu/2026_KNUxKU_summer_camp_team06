import { CATEGORIES, isHttpUrl } from '../shared/contracts.js';

export class ValidationService {
  validate(normalized) {
    const errors = [];
    if (!isHttpUrl(normalized.source_url)) errors.push('INVALID_SOURCE_URL');
    if (!normalized.platform) errors.push('MISSING_PLATFORM');
    if (!normalized.title) errors.push('MISSING_TITLE');
    if (typeof normalized.body !== 'string' || normalized.body.trim().length < 20) errors.push('CONTENT_INSUFFICIENT');
    if (!CATEGORIES.includes(normalized.category)) errors.push('CATEGORY_UNRESOLVED');
    if (!Array.isArray(normalized.evidence) || normalized.evidence.length === 0) errors.push('EVIDENCE_REQUIRED');
    return { ok: errors.length === 0, errors };
  }
}
