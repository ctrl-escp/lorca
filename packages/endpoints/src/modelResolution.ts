import type {DiscoveredModel, ModelRef, ModelUsageBucket, PipelineStep} from '@lorca/core';

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
  return ref.kind === 'fixed' && Boolean(ref.endpointId && ref.modelName);
}

/** Pick the first model matching preferredBucket, else the first available model. */
export function pickModelRef(
  models: readonly DiscoveredModel[],
  preferredBucket?: ModelUsageBucket,
): ModelRef | null {
  const available = models.filter((m) => m.endpointId);
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
  return steps.map((s) => autoAssignModelToStep(s, models, preferredBucket));
}
