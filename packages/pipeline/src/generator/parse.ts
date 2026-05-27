import {countPlanEntries} from './count.js';
import {
  PIPELINE_GENERATOR_HARD_ENTRY_CAP,
  PIPELINE_GENERATOR_SCHEMA_VERSION,
  type GeneratorPlanEntry,
  type PipelineGeneratorParseResult,
  type PipelineGeneratorPlan,
} from './types.js';

export interface ParsePipelineGeneratorPlanOptions {
  allowCapsules?: boolean;
  applyMode?: 'replace' | 'append';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```$/i.exec(trimmed)?.[1]?.trim();
  for (const candidate of [fenced, trimmed]) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      // try next
    }
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      // fall through
    }
  }
  return null;
}

function coercePlanEntry(raw: unknown): GeneratorPlanEntry | null {
  if (!isRecord(raw) || typeof raw.kind !== 'string' || typeof raw.stepKey !== 'string') {
    return null;
  }
  const base = {stepKey: raw.stepKey, ...(typeof raw.label === 'string' ? {label: raw.label} : {})};

  switch (raw.kind) {
    case 'suggestion':
      if (typeof raw.suggestionId !== 'string') return null;
      return {kind: 'suggestion', ...base, suggestionId: raw.suggestionId};
    case 'custom':
      return {kind: 'custom', ...base};
    case 'capsule':
      if (typeof raw.capsuleId !== 'string' || typeof raw.capsuleVersion !== 'string') return null;
      return {
        kind: 'capsule',
        ...base,
        capsuleId: raw.capsuleId,
        capsuleVersion: raw.capsuleVersion,
      };
    case 'loop':
      if (!Array.isArray(raw.steps)) return null;
      return {
        kind: 'loop',
        ...base,
        steps: raw.steps.map(coercePlanEntry).filter((e): e is GeneratorPlanEntry => e !== null),
      };
    case 'presentation':
      if (typeof raw.text !== 'string') return null;
      return {kind: 'presentation', ...base, text: raw.text};
    default:
      return null;
  }
}

function collectStepKeys(entries: readonly GeneratorPlanEntry[], out: string[]): void {
  for (const entry of entries) {
    out.push(entry.stepKey);
    if (entry.kind === 'loop') collectStepKeys(entry.steps, out);
  }
}

function findDuplicateStepKeys(entries: readonly GeneratorPlanEntry[]): string | null {
  const keys: string[] = [];
  collectStepKeys(entries, keys);
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) return key;
    seen.add(key);
  }
  return null;
}

/**
 * Parse versioned generator plan JSON. Phase 0: schema wrapper, entry cap, duplicate stepKey.
 * Ref grammar and forward-ref checks expand in Phase 1.
 */
export function parsePipelineGeneratorPlan(
  text: string,
  options: ParsePipelineGeneratorPlanOptions = {},
): PipelineGeneratorParseResult {
  const parsed = extractJsonObject(text);
  if (parsed === null) {
    return {ok: false, message: 'Could not parse generator response as JSON'};
  }

  if (Array.isArray(parsed)) {
    return {ok: false, message: 'Legacy suggestion-array format is no longer supported'};
  }

  if (!isRecord(parsed)) {
    return {ok: false, message: 'Generator response must be a JSON object'};
  }

  const version = parsed.schemaVersion;
  if (version !== PIPELINE_GENERATOR_SCHEMA_VERSION) {
    return {
      ok: false,
      message: `Unsupported schemaVersion: ${String(version)} (expected ${PIPELINE_GENERATOR_SCHEMA_VERSION})`,
    };
  }

  if (!Array.isArray(parsed.steps)) {
    return {ok: false, message: 'Generator plan must include a steps array'};
  }

  const steps = parsed.steps.map(coercePlanEntry).filter((e): e is GeneratorPlanEntry => e !== null);
  if (steps.length !== parsed.steps.length) {
    return {ok: false, message: 'One or more plan entries are invalid'};
  }

  const allowCapsules = options.allowCapsules ?? false;
  if (!allowCapsules && steps.some((entry) => entry.kind === 'capsule')) {
    return {ok: false, message: 'Capsule steps are not allowed when capsule toggle is off'};
  }

  const duplicate = findDuplicateStepKeys(steps);
  if (duplicate) {
    return {ok: false, message: `Duplicate stepKey: ${duplicate}`};
  }

  if (countPlanEntries(steps, {recursive: true}) > PIPELINE_GENERATOR_HARD_ENTRY_CAP) {
    return {
      ok: false,
      message: `Plan exceeds hard limit of ${PIPELINE_GENERATOR_HARD_ENTRY_CAP} entries`,
    };
  }

  const plan: PipelineGeneratorPlan = {
    schemaVersion: PIPELINE_GENERATOR_SCHEMA_VERSION,
    steps,
    ...(Array.isArray(parsed.assumptions)
      ? {assumptions: parsed.assumptions.filter((a): a is string => typeof a === 'string')}
      : {}),
    ...(Array.isArray(parsed.warnings)
      ? {warnings: parsed.warnings.filter((w): w is string => typeof w === 'string')}
      : {}),
  };

  void options.applyMode;

  return {ok: true, plan};
}
