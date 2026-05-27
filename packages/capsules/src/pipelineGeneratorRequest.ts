import type {AiEndpointConfig, DiscoveredModel, PipelineDefinition} from '@lorca/core';
import {buildGeneratorModelCatalog} from '@lorca/endpoints';
import {isDefaultPipelineStub} from '@lorca/pipeline';
import {buildRolePromptCatalog} from './rolePromptCatalog.js';
import {getBuiltinExamples} from './examples/index.js';
import {ALL_SUGGESTIONS} from './suggestions/index.js';

export type GeneratorApplyMode = 'replace' | 'append';

export interface BuildPipelineGeneratorRequestInput {
  description: string;
  allowCapsules?: boolean;
  applyMode?: GeneratorApplyMode;
  refinePreviousPlan?: boolean;
  previousPlanJson?: string;
  previousErrors?: string[];
  currentPipeline?: PipelineDefinition;
  models?: readonly DiscoveredModel[];
  endpoints?: readonly AiEndpointConfig[];
}

export interface PipelineGeneratorRequestPayload {
  description: string;
  applyMode: GeneratorApplyMode;
  allowCapsules: boolean;
  suggestionCatalog: {id: string; name: string; category: string; preferredModelBucket?: string | null}[];
  rolePromptCatalog: ReturnType<typeof buildRolePromptCatalog>;
  modelCatalog: {modelId: string; displayName: string; buckets: string[]}[];
  capsuleCatalog: {id: string; name: string; version: string}[];
  pipelineContext?: {name: string; stepCount: number; namespaces: string[]};
  refine?: {previousPlanJson: string; errors: string[]};
}

/**
 * Assemble catalogs and context for the LORCA_PIPELINE_GENERATOR capsule.
 */
export function buildPipelineGeneratorRequest(
  input: BuildPipelineGeneratorRequestInput,
): PipelineGeneratorRequestPayload {
  const applyMode = input.applyMode ?? 'replace';
  const allowCapsules = input.allowCapsules ?? false;

  const suggestionCatalog = ALL_SUGGESTIONS.map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
    preferredModelBucket: s.preferredModelBucket ?? null,
  }));

  const rolePromptCatalog = buildRolePromptCatalog();

  const modelCatalog = input.models && input.endpoints
    ? buildGeneratorModelCatalog({models: input.models, endpoints: input.endpoints}).map((m) => ({
      modelId: m.modelId,
      displayName: m.displayName,
      buckets: m.buckets,
    }))
    : [];

  const capsuleCatalog = allowCapsules
    ? getBuiltinExamples()
      .filter((ex) => ex.status === 'locked')
      .map((ex) => ({id: ex.id, name: ex.name, version: ex.version}))
    : [];

  let pipelineContext: PipelineGeneratorRequestPayload['pipelineContext'];
  const pipeline = input.currentPipeline;
  if (pipeline && !isDefaultPipelineStub(pipeline)) {
    const namespaces = new Set<string>([pipeline.input.outputNamespace]);
    for (const step of pipeline.steps) {
      namespaces.add(step.outputNamespace);
    }
    pipelineContext = {
      name: pipeline.name,
      stepCount: pipeline.steps.length,
      namespaces: [...namespaces],
    };
  }

  const payload: PipelineGeneratorRequestPayload = {
    description: input.description,
    applyMode,
    allowCapsules,
    suggestionCatalog,
    rolePromptCatalog,
    modelCatalog,
    capsuleCatalog,
    ...(pipelineContext ? {pipelineContext} : {}),
  };

  if (input.refinePreviousPlan && input.previousPlanJson) {
    payload.refine = {
      previousPlanJson: input.previousPlanJson,
      errors: input.previousErrors ?? [],
    };
  }

  return payload;
}

/** User-turn text: description plus structured catalogs for the generator model. */
export function formatPipelineGeneratorUserMessage(
  payload: PipelineGeneratorRequestPayload,
): string {
  const context = {
    applyMode: payload.applyMode,
    allowCapsules: payload.allowCapsules,
    suggestionCatalog: payload.suggestionCatalog,
    rolePromptCatalog: payload.rolePromptCatalog,
    modelCatalog: payload.modelCatalog,
    capsuleCatalog: payload.capsuleCatalog,
    ...(payload.pipelineContext ? {pipelineContext: payload.pipelineContext} : {}),
    ...(payload.refine ? {refine: payload.refine} : {}),
  };

  return [
    payload.description,
    '',
    '---',
    'Planning context (JSON):',
    JSON.stringify(context, null, 2),
  ].join('\n');
}
