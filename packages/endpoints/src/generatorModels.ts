import type {AiEndpointConfig, DiscoveredModel, ModelUsageBucket, PipelineStep} from '@lorca/core';
import {
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

/** Stable `endpointId::modelName` ids for generator plan modelId fields. */
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

/**
 * Apply generator-requested models to materialized steps.
 * Phase 0: passthrough steps; full step/slot wiring in Phase 3.
 */
export function resolveGeneratorModelAssignments(
  input: ResolveGeneratorModelAssignmentsInput,
): {steps: PipelineStep[]; unresolved: UnresolvedModelRef[]} {
  const catalog = buildGeneratorModelCatalog({
    models: input.models,
    endpoints: input.endpoints,
  });
  const catalogIds = new Set(catalog.map((e) => e.modelId));
  const unresolved: UnresolvedModelRef[] = [];

  for (const request of input.requests) {
    if (request.modelId && !catalogIds.has(request.modelId)) {
      if (request.modelBucket) {
        const ref = pickModelRefMatchingBuckets(input.models, [request.modelBucket])
          ?? pickModelRef(input.models, request.modelBucket);
        if (!ref || !isModelRefConfigured(ref)) {
          unresolved.push({
            stepId: request.stepId,
            stepKey: request.stepKey,
            reason: `No model available for bucket ${request.modelBucket}`,
          });
        }
        continue;
      }
      unresolved.push({
        stepId: request.stepId,
        stepKey: request.stepKey,
        reason: `Unknown modelId: ${request.modelId}`,
      });
    }
  }

  return {steps: input.steps, unresolved};
}
