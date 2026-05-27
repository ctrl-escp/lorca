import type {
  AiEndpointConfig,
  DiscoveredModel,
  ModelRef,
  ModelUsageBucket,
  PipelineStep,
} from '@lorca/core';
import {
  applyModelRefToStep,
  isModelRefConfigured,
  pickModelRef,
  pickModelRefMatchingBuckets,
} from './modelResolution.js';

export interface GeneratorModelCatalogEntry {
  modelId: string;
  endpointId: string;
  providerModelName: string;
  displayName: string;
  buckets: ModelUsageBucket[];
}

export interface BuildGeneratorModelCatalogInput {
  models: readonly DiscoveredModel[];
  endpoints: readonly AiEndpointConfig[];
}

/** Mirrors @lorca/pipeline generator assignment request shape (kept here to avoid endpoints↔pipeline cycle). */
export interface GeneratorModelAssignmentRequest {
  stepId: string;
  stepKey: string;
  modelId?: string;
  modelBucket?: ModelUsageBucket;
  slotModels?: Record<string, {modelId?: string; modelBucket?: ModelUsageBucket}>;
}

export interface UnresolvedModelRef {
  stepId: string;
  stepKey: string;
  slotName?: string;
  reason: string;
}

export function formatGeneratorModelId(endpointId: string, modelName: string): string {
  return `${endpointId}::${modelName}`;
}

export function parseGeneratorModelId(modelId: string): {endpointId: string; modelName: string} | null {
  const idx = modelId.indexOf('::');
  if (idx <= 0 || idx >= modelId.length - 2) return null;
  return {endpointId: modelId.slice(0, idx), modelName: modelId.slice(idx + 2)};
}

export function buildGeneratorModelCatalog(
  input: BuildGeneratorModelCatalogInput,
): GeneratorModelCatalogEntry[] {
  const enabledEndpoints = new Set(
    input.endpoints.filter((e) => e.enabled).map((e) => e.id),
  );
  return input.models
    .filter((m) => m.enabled !== false && enabledEndpoints.has(m.endpointId))
    .map((m) => ({
      modelId: formatGeneratorModelId(m.endpointId, m.providerModelName),
      endpointId: m.endpointId,
      providerModelName: m.providerModelName,
      displayName: m.displayName ?? m.providerModelName,
      buckets: m.userBuckets ?? m.buckets,
    }));
}

export interface ResolveGeneratorModelAssignmentsInput {
  steps: PipelineStep[];
  requests: GeneratorModelAssignmentRequest[];
  models: readonly DiscoveredModel[];
  endpoints: readonly AiEndpointConfig[];
}

function cloneSteps(steps: PipelineStep[]): PipelineStep[] {
  return JSON.parse(JSON.stringify(steps)) as PipelineStep[];
}

function resolveModelRef(
  modelId: string | undefined,
  modelBucket: ModelUsageBucket | undefined,
  models: readonly DiscoveredModel[],
  catalogIds: ReadonlySet<string>,
): ModelRef | null {
  if (modelId && catalogIds.has(modelId)) {
    const parsed = parseGeneratorModelId(modelId);
    if (parsed) {
      return {kind: 'fixed', endpointId: parsed.endpointId, modelName: parsed.modelName};
    }
  }

  if (modelBucket) {
    const ref = pickModelRefMatchingBuckets(models, [modelBucket])
      ?? pickModelRef(models, modelBucket);
    if (ref && isModelRefConfigured(ref)) return ref;
  }

  if (modelId && !catalogIds.has(modelId)) {
    return null;
  }

  if (!modelId && !modelBucket) {
    const fallback = pickModelRef(models, 'general');
    if (fallback && isModelRefConfigured(fallback)) return fallback;
  }

  return null;
}

function applyRequestToStep(
  step: PipelineStep,
  request: GeneratorModelAssignmentRequest,
  models: readonly DiscoveredModel[],
  catalogIds: ReadonlySet<string>,
  unresolved: UnresolvedModelRef[],
): PipelineStep {
  if (step.config.type === 'model-call') {
    const ref = resolveModelRef(request.modelId, request.modelBucket, models, catalogIds);
    if (!ref || !isModelRefConfigured(ref)) {
      unresolved.push({
        stepId: step.id,
        stepKey: request.stepKey,
        reason: request.modelId
          ? `Could not resolve model ${request.modelId}`
          : `No model available${request.modelBucket ? ` for bucket ${request.modelBucket}` : ''}`,
      });
      return step;
    }
    return applyModelRefToStep(step, ref);
  }

  if (step.config.type === 'capsule-instance' && request.slotModels) {
    const bindings = {...(step.config.modelSlotBindings ?? {})};
    for (const [slotName, slotReq] of Object.entries(request.slotModels)) {
      const ref = resolveModelRef(slotReq.modelId, slotReq.modelBucket, models, catalogIds);
      if (!ref || !isModelRefConfigured(ref)) {
        unresolved.push({
          stepId: step.id,
          stepKey: request.stepKey,
          slotName,
          reason: slotReq.modelId
            ? `Could not resolve slot model ${slotReq.modelId}`
            : `No model for slot ${slotName}${slotReq.modelBucket ? ` (bucket ${slotReq.modelBucket})` : ''}`,
        });
        continue;
      }
      bindings[slotName] = ref;
    }
    return {
      ...step,
      config: {...step.config, modelSlotBindings: bindings},
    };
  }

  return step;
}

function applyRequestsRecursive(
  steps: PipelineStep[],
  requestByStepId: Map<string, GeneratorModelAssignmentRequest>,
  models: readonly DiscoveredModel[],
  catalogIds: ReadonlySet<string>,
  unresolved: UnresolvedModelRef[],
): PipelineStep[] {
  return steps.map((step) => {
    if (step.config.type === 'loop-group') {
      return {
        ...step,
        config: {
          ...step.config,
          steps: applyRequestsRecursive(
            step.config.steps,
            requestByStepId,
            models,
            catalogIds,
            unresolved,
          ),
        },
      };
    }

    const request = requestByStepId.get(step.id);
    if (request) {
      return applyRequestToStep(step, request, models, catalogIds, unresolved);
    }

    return step;
  });
}

function collectUnconfiguredSteps(
  steps: PipelineStep[],
  unresolved: UnresolvedModelRef[],
  requestByStepId: Map<string, GeneratorModelAssignmentRequest>,
): void {
  for (const step of steps) {
    if (step.config.type === 'model-call') {
      const ref = step.config.modelRef;
      if (!isModelRefConfigured(ref)) {
        const req = requestByStepId.get(step.id);
        const already = unresolved.some((u) => u.stepId === step.id && !u.slotName);
        if (!already) {
          unresolved.push({
            stepId: step.id,
            stepKey: req?.stepKey ?? step.id,
            reason: 'Model not configured',
          });
        }
      }
    }
    if (step.config.type === 'capsule-instance' && step.config.modelSlotBindings) {
      for (const [slotName, slotRef] of Object.entries(step.config.modelSlotBindings)) {
        if (!isModelRefConfigured(slotRef)) {
          const req = requestByStepId.get(step.id);
          const already = unresolved.some((u) => u.stepId === step.id && u.slotName === slotName);
          if (!already) {
            unresolved.push({
              stepId: step.id,
              stepKey: req?.stepKey ?? step.id,
              slotName,
              reason: `Slot ${slotName} not configured`,
            });
          }
        }
      }
    }
    if (step.config.type === 'loop-group') {
      collectUnconfiguredSteps(step.config.steps, unresolved, requestByStepId);
    }
  }
}

export function resolveGeneratorModelAssignments(
  input: ResolveGeneratorModelAssignmentsInput,
): {steps: PipelineStep[]; unresolved: UnresolvedModelRef[]} {
  const catalogIds = new Set(
    buildGeneratorModelCatalog({
      models: input.models,
      endpoints: input.endpoints,
    }).map((e) => e.modelId),
  );

  const requestByStepId = new Map(
    input.requests.map((request) => [request.stepId, request]),
  );

  const unresolved: UnresolvedModelRef[] = [];
  let steps = cloneSteps(input.steps);
  steps = applyRequestsRecursive(steps, requestByStepId, input.models, catalogIds, unresolved);
  collectUnconfiguredSteps(steps, unresolved, requestByStepId);

  return {steps, unresolved};
}
