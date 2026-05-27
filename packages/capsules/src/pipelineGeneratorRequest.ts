import type {PipelineDefinition} from '@lorca/core';
import {isDefaultPipelineStub} from '@lorca/pipeline';
import {buildRolePromptCatalog} from './rolePromptCatalog.js';
import {getBuiltinExamples} from './examples/index.js';
import {ALL_SUGGESTIONS} from './suggestions/index.js';

export interface BuildPipelineGeneratorRequestInput {
  description: string;
  allowCapsules?: boolean;
  applyMode?: 'replace' | 'append';
  refinePreviousPlan?: boolean;
  previousPlanJson?: string;
  previousErrors?: string[];
  currentPipeline?: PipelineDefinition;
}

export interface PipelineGeneratorRequestPayload {
  description: string;
  suggestionCatalog: {id: string; name: string; category: string}[];
  rolePromptCatalog: ReturnType<typeof buildRolePromptCatalog>;
  capsuleCatalog: {id: string; name: string; version: string}[];
  pipelineContext?: {name: string; stepCount: number; namespaces: string[]};
  refine?: {previousPlanJson: string; errors: string[]};
}

/**
 * Assemble catalogs and context for the LORCA_PIPELINE_GENERATOR capsule prompt.
 * Phase 0: catalog shape only; full ref-grammar spec in Phase 5.
 */
export function buildPipelineGeneratorRequest(
  input: BuildPipelineGeneratorRequestInput,
): PipelineGeneratorRequestPayload {
  const suggestionCatalog = ALL_SUGGESTIONS.map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
  }));

  const rolePromptCatalog = buildRolePromptCatalog();

  const capsuleCatalog = input.allowCapsules
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
    suggestionCatalog,
    rolePromptCatalog,
    capsuleCatalog,
    ...(pipelineContext ? {pipelineContext} : {}),
  };

  if (input.refinePreviousPlan && input.previousPlanJson) {
    payload.refine = {
      previousPlanJson: input.previousPlanJson,
      errors: input.previousErrors ?? [],
    };
  }

  void input.applyMode;

  return payload;
}
