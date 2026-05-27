import type {LoopExitCondition, ModelUsageBucket} from '@lorca/core';
import type {
  GeneratorHistoryRead,
  GeneratorInputSource,
  GeneratorPlanEntry,
  GeneratorPlanPrompt,
  GeneratorPromptMode,
} from './types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isLoopExitCondition(value: unknown): value is LoopExitCondition {
  if (!isRecord(value)) return false;
  if (value.type === 'iterations') return true;
  return value.type === 'json-field-equals'
    && typeof value.fieldPath === 'string'
    && ['boolean', 'string', 'number'].includes(typeof value.value);
}

function coercePrompt(raw: unknown): GeneratorPlanPrompt | undefined {
  if (!isRecord(raw) || typeof raw.mode !== 'string') return undefined;
  const mode = raw.mode as GeneratorPromptMode;
  if (mode !== 'catalog' && mode !== 'custom') return undefined;
  return {
    mode,
    ...(typeof raw.rolePromptId === 'string' ? {rolePromptId: raw.rolePromptId} : {}),
    ...(typeof raw.text === 'string' ? {text: raw.text} : {}),
  };
}

function coerceHistoryReads(raw: unknown): GeneratorHistoryRead[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const reads: GeneratorHistoryRead[] = [];
  for (const item of raw) {
    if (!isRecord(item) || typeof item.ref !== 'string' || typeof item.tagName !== 'string') {
      return undefined;
    }
    reads.push({ref: item.ref, tagName: item.tagName});
  }
  return reads;
}

function coerceStringRecord(raw: unknown): Record<string, string> | undefined {
  if (!isRecord(raw)) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'string') return undefined;
    out[key] = value;
  }
  return out;
}

function coerceInputSource(raw: unknown): GeneratorInputSource | undefined {
  if (raw === 'user' || raw === 'previous-step' || raw === 'current-pipeline-last') {
    return raw;
  }
  return undefined;
}

function coerceSlotModels(
  raw: unknown,
): Record<string, {modelId?: string; modelBucket?: ModelUsageBucket}> | undefined {
  if (!isRecord(raw)) return undefined;
  const out: Record<string, {modelId?: string; modelBucket?: ModelUsageBucket}> = {};
  for (const [slot, value] of Object.entries(raw)) {
    if (!isRecord(value)) return undefined;
    out[slot] = {
      ...(typeof value.modelId === 'string' ? {modelId: value.modelId} : {}),
      ...(typeof value.modelBucket === 'string' ? {modelBucket: value.modelBucket as ModelUsageBucket} : {}),
    };
  }
  return out;
}

export function coercePlanEntry(raw: unknown): GeneratorPlanEntry | null {
  if (!isRecord(raw) || typeof raw.kind !== 'string' || typeof raw.stepKey !== 'string') {
    return null;
  }
  const base = {stepKey: raw.stepKey, ...(typeof raw.label === 'string' ? {label: raw.label} : {})};

  switch (raw.kind) {
    case 'suggestion': {
      if (typeof raw.suggestionId !== 'string') return null;
      const prompt = coercePrompt(raw.prompt);
      return {
        kind: 'suggestion',
        ...base,
        suggestionId: raw.suggestionId,
        ...(prompt ? {prompt} : {}),
      };
    }
    case 'custom': {
      const prompt = coercePrompt(raw.prompt);
      const historyReads = coerceHistoryReads(raw.historyReads);
      const inputSource = coerceInputSource(raw.inputSource);
      return {
        kind: 'custom',
        ...base,
        ...(inputSource ? {inputSource} : {}),
        ...(prompt ? {prompt} : {}),
        ...(typeof raw.modelId === 'string' ? {modelId: raw.modelId} : {}),
        ...(typeof raw.modelBucket === 'string' ? {modelBucket: raw.modelBucket as ModelUsageBucket} : {}),
        ...(raw.outputType === 'text' || raw.outputType === 'json' ? {outputType: raw.outputType} : {}),
        ...(historyReads ? {historyReads} : {}),
      };
    }
    case 'capsule': {
      if (typeof raw.capsuleId !== 'string' || typeof raw.capsuleVersion !== 'string') return null;
      const inputBindings = coerceStringRecord(raw.inputBindings);
      const outputBindings = coerceStringRecord(raw.outputBindings);
      const slotModels = coerceSlotModels(raw.slotModels);
      return {
        kind: 'capsule',
        ...base,
        capsuleId: raw.capsuleId,
        capsuleVersion: raw.capsuleVersion,
        ...(inputBindings ? {inputBindings} : {}),
        ...(outputBindings ? {outputBindings} : {}),
        ...(slotModels ? {slotModels} : {}),
      };
    }
    case 'loop': {
      if (!Array.isArray(raw.steps)) return null;
      const inner = raw.steps.map(coercePlanEntry).filter((e): e is GeneratorPlanEntry => e !== null);
      if (inner.length !== raw.steps.length) return null;
      return {
        kind: 'loop',
        ...base,
        steps: inner,
        ...(typeof raw.maxIterations === 'number' ? {maxIterations: raw.maxIterations} : {}),
        ...(isLoopExitCondition(raw.exitCondition) ? {exitCondition: raw.exitCondition} : {}),
      };
    }
    case 'presentation': {
      if (typeof raw.text !== 'string') return null;
      return {kind: 'presentation', ...base, text: raw.text};
    }
    default:
      return null;
  }
}
