import type {CapsuleModelSlot, DiscoveredModel, ModelRef, ModelUsageBucket, PipelineStep} from '@lorca/core';
import {
  formatModelCallRequirementMessage,
  formatSlotModelRequirementMessage,
  noEnabledModelsMessage,
} from './bucketLabels.js';

export {MODEL_USAGE_BUCKET_LABELS, formatBucketRequirement, formatBucketsRequirement} from './bucketLabels.js';
export {
  formatModelCallRequirementMessage,
  formatSlotModelRequirementMessage,
  noEnabledModelsMessage,
} from './bucketLabels.js';

export function effectiveBuckets(model: DiscoveredModel): ModelUsageBucket[] {
  return model.userBuckets ?? model.buckets;
}

export function modelMatchesBucket(model: DiscoveredModel, bucket: ModelUsageBucket): boolean {
  return effectiveBuckets(model).includes(bucket);
}

export function modelMatchesAnyBucket(
  model: DiscoveredModel,
  buckets: readonly ModelUsageBucket[],
): boolean {
  return buckets.some((b) => modelMatchesBucket(model, b));
}

/** Relevant models (matching any bucket) first, then the rest; stable order within each group. */
export function partitionModelsByBuckets(
  models: readonly DiscoveredModel[],
  buckets: readonly ModelUsageBucket[],
): {relevant: DiscoveredModel[]; other: DiscoveredModel[]} {
  const relevant: DiscoveredModel[] = [];
  const other: DiscoveredModel[] = [];
  for (const model of models) {
    if (modelMatchesAnyBucket(model, buckets)) relevant.push(model);
    else other.push(model);
  }
  return {relevant, other};
}

export function isModelRefConfigured(ref: ModelRef): boolean {
  if (ref.kind === 'fixed') return Boolean(ref.endpointId && ref.modelName);
  if (ref.kind === 'any-enabled-endpoint') return Boolean(ref.modelName);
  return false;
}

/** Pick the first enabled model matching any of the buckets, or null if none match. */
export function pickModelRefMatchingBuckets(
  models: readonly DiscoveredModel[],
  buckets: readonly ModelUsageBucket[],
): ModelRef | null {
  const available = enabledModels(models);
  if (available.length === 0) return null;

  for (const bucket of buckets) {
    const match = available.find((m) => modelMatchesBucket(m, bucket));
    if (match) {
      return {kind: 'fixed', endpointId: match.endpointId, modelName: match.providerModelName};
    }
  }
  return null;
}

/** Pick the first model matching preferredBucket, else the first available model. */
export function pickModelRef(
  models: readonly DiscoveredModel[],
  preferredBucket?: ModelUsageBucket,
): ModelRef | null {
  const available = enabledModels(models);
  if (available.length === 0) return null;

  if (preferredBucket) {
    const match = available.find((m) => modelMatchesBucket(m, preferredBucket));
    if (match) {
      return {kind: 'fixed', endpointId: match.endpointId, modelName: match.providerModelName};
    }
  }

  const first = available[0]!;
  return {kind: 'fixed', endpointId: first.endpointId, modelName: first.providerModelName};
}

/** Pick a slot model only when it satisfies slot hints; never falls back to an arbitrary model. */
export function pickModelRefForSlotStrict(
  models: readonly DiscoveredModel[],
  slot: CapsuleModelSlot,
): ModelRef | null {
  const available = enabledModels(models);
  if (available.length === 0) return null;

  if (slot.defaultModelRef) {
    const exactDefault = available.find((m) =>
      m.endpointId === slot.defaultModelRef?.endpointId
      && m.providerModelName === slot.defaultModelRef.modelName,
    );
    if (exactDefault) {
      return {kind: 'fixed', endpointId: exactDefault.endpointId, modelName: exactDefault.providerModelName};
    }
  }

  for (const name of slot.preferredModelNames ?? []) {
    const exactName = available.find((m) => modelNameMatches(m, name));
    if (exactName) {
      return {kind: 'fixed', endpointId: exactName.endpointId, modelName: exactName.providerModelName};
    }
  }

  const ranked = [...available].sort((a, b) => slotModelScore(b, slot) - slotModelScore(a, slot));
  const best = ranked[0];
  if (best && slotModelScore(best, slot) > 0) {
    return {kind: 'fixed', endpointId: best.endpointId, modelName: best.providerModelName};
  }

  return pickModelRefMatchingBuckets(models, slot.suggestedBuckets);
}

export type ModelAutoSelectResult =
  | {ok: true; modelRef: Extract<ModelRef, {kind: 'fixed'}>}
  | {ok: false; warning: string};

export function autoSelectModelCallStep(
  step: PipelineStep,
  models: readonly DiscoveredModel[],
  suggestedBuckets: readonly ModelUsageBucket[],
): ModelAutoSelectResult {
  if (step.type !== 'model-call') {
    return {ok: false, warning: 'Auto-select is only available for model-call steps.'};
  }
  if (enabledModels(models).length === 0) {
    return {ok: false, warning: noEnabledModelsMessage()};
  }
  const picked = pickModelRefMatchingBuckets(models, suggestedBuckets);
  if (!picked || picked.kind !== 'fixed') {
    return {ok: false, warning: formatModelCallRequirementMessage(suggestedBuckets)};
  }
  return {ok: true, modelRef: picked};
}

export function autoSelectCapsuleSlot(
  slot: CapsuleModelSlot,
  models: readonly DiscoveredModel[],
): ModelAutoSelectResult {
  if (enabledModels(models).length === 0) {
    return {ok: false, warning: noEnabledModelsMessage()};
  }
  const picked = pickModelRefForSlotStrict(models, slot);
  if (!picked || picked.kind !== 'fixed') {
    return {ok: false, warning: formatSlotModelRequirementMessage(slot)};
  }
  return {ok: true, modelRef: picked};
}

/** Pick the closest available model for a Capsule slot using exact names, then family/size/bucket hints. */
export function pickModelRefForSlot(
  models: readonly DiscoveredModel[],
  slot: CapsuleModelSlot,
): ModelRef | null {
  const available = enabledModels(models);
  if (available.length === 0) return null;

  if (slot.defaultModelRef) {
    const exactDefault = available.find((m) =>
      m.endpointId === slot.defaultModelRef?.endpointId
      && m.providerModelName === slot.defaultModelRef.modelName,
    );
    if (exactDefault) {
      return {kind: 'fixed', endpointId: exactDefault.endpointId, modelName: exactDefault.providerModelName};
    }
  }

  const preferredNames = slot.preferredModelNames ?? [];
  for (const name of preferredNames) {
    const exactName = available.find((m) => modelNameMatches(m, name));
    if (exactName) {
      return {kind: 'fixed', endpointId: exactName.endpointId, modelName: exactName.providerModelName};
    }
  }

  const ranked = [...available].sort((a, b) =>
    slotModelScore(b, slot) - slotModelScore(a, slot),
  );
  const best = ranked[0];
  if (!best || slotModelScore(best, slot) <= 0) {
    const fallback = pickModelRef(models, slot.suggestedBuckets[0]);
    return fallback;
  }
  return {kind: 'fixed', endpointId: best.endpointId, modelName: best.providerModelName};
}

export function applyModelRefToStep(step: PipelineStep, modelRef: ModelRef): PipelineStep {
  if (step.type !== 'model-call' || step.config.type !== 'model-call') return step;
  return {...step, config: {...step.config, modelRef}};
}

export function autoAssignModelToStep(
  step: PipelineStep,
  models: readonly DiscoveredModel[],
  preferredBucket?: ModelUsageBucket,
): PipelineStep {
  if (step.type !== 'model-call' || step.config.type !== 'model-call') return step;
  if (isModelRefConfigured(step.config.modelRef)) return step;
  const picked = pickModelRef(models, preferredBucket);
  if (!picked) return step;
  return applyModelRefToStep(step, picked);
}

export function autoAssignModelsToSteps(
  steps: PipelineStep[],
  models: readonly DiscoveredModel[],
  preferredBucket?: ModelUsageBucket,
): PipelineStep[] {
  return steps.map((s) => {
    const assigned = autoAssignModelToStep(s, models, preferredBucket);
    if (assigned.config.type === 'loop-group') {
      return {
        ...assigned,
        config: {
          ...assigned.config,
          steps: autoAssignModelsToSteps(assigned.config.steps, models, preferredBucket),
        },
      };
    }
    return assigned;
  });
}

function modelNameMatches(model: DiscoveredModel, preferredName: string): boolean {
  const wanted = lc(preferredName);
  return lc(model.providerModelName) === wanted || lc(model.displayName) === wanted;
}

function slotModelScore(model: DiscoveredModel, slot: CapsuleModelSlot): number {
  let score = 0;
  const name = `${model.providerModelName} ${model.displayName}`.toLowerCase();

  for (const [index, preferred] of (slot.preferredModelNames ?? []).entries()) {
    if (name.includes(lc(preferred))) score += 90 - index;
  }
  for (const family of slot.preferredFamilies ?? []) {
    if (lc(model.family) === lc(family) || name.includes(lc(family))) score += 35;
  }
  for (const size of slot.preferredParameterSizes ?? []) {
    if (lc(model.parameterSize) === lc(size) || name.includes(lc(size))) score += 25;
  }
  for (const quant of slot.preferredQuantizations ?? []) {
    if (lc(model.quantization) === lc(quant) || name.includes(lc(quant))) score += 10;
  }
  for (const bucket of slot.suggestedBuckets) {
    if (modelMatchesBucket(model, bucket)) score += 15;
  }
  return score;
}

function lc(value: string | undefined): string {
  return value?.toLowerCase() ?? '';
}

function enabledModels(models: readonly DiscoveredModel[]): DiscoveredModel[] {
  return models.filter((m) => m.endpointId && m.enabled !== false);
}
