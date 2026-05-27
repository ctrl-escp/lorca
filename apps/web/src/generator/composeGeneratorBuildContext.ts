import type {CapsuleDefinition, PipelineDefinition} from '@lorca/core';
import {
  ALL_SUGGESTIONS,
  buildRolePromptCatalog,
  instantiateSuggestion,
} from '@lorca/capsules';
import {
  buildGeneratorModelCatalog,
  resolveGeneratorModelAssignments,
} from '@lorca/endpoints';
import type {GeneratorBuildContext, GeneratorApplyMode} from '@lorca/pipeline';
import {useCapsulesStore} from '../stores/capsules.js';
import {useEndpointsStore} from '../stores/endpoints.js';
import {useModelsStore} from '../stores/models.js';

export interface ComposeGeneratorBuildContextInput {
  allowCapsules: boolean;
  applyMode: GeneratorApplyMode;
  existingPipeline?: PipelineDefinition;
}

export function composeGeneratorBuildContext(
  input: ComposeGeneratorBuildContextInput,
): GeneratorBuildContext {
  const capsulesStore = useCapsulesStore();
  const modelsStore = useModelsStore();
  const endpointsStore = useEndpointsStore();

  const rolePromptById = new Map(
    buildRolePromptCatalog().map((entry) => [entry.id, entry.text]),
  );

  return {
    allowCapsules: input.allowCapsules,
    applyMode: input.applyMode,
    ...(input.existingPipeline ? {existingPipeline: input.existingPipeline} : {}),

    instantiateSuggestion(suggestionId, existingNamespaces, existingSteps) {
      const suggestion = ALL_SUGGESTIONS.find((s) => s.id === suggestionId);
      if (!suggestion) return null;
      return instantiateSuggestion(suggestion, existingNamespaces, existingSteps);
    },

    getRolePrompt(rolePromptId) {
      return rolePromptById.get(rolePromptId) ?? null;
    },

    resolveCapsule(capsuleId, capsuleVersion) {
      const capsule = capsulesStore.getCapsule(capsuleId);
      if (!capsule || capsule.version !== capsuleVersion) return undefined;
      return capsule as CapsuleDefinition;
    },

    resolveModelAssignments({steps, requests}) {
      return resolveGeneratorModelAssignments({
        steps,
        requests,
        models: modelsStore.models,
        endpoints: endpointsStore.endpoints,
      });
    },
  };
}

/** Test-friendly factory without Pinia (Phase 0 scaffolding). */
export function composeGeneratorBuildContextFromDeps(deps: {
  allowCapsules: boolean;
  applyMode: GeneratorApplyMode;
  existingPipeline?: PipelineDefinition;
  capsules: readonly CapsuleDefinition[];
  models: ReturnType<typeof useModelsStore>['models'];
  endpoints: ReturnType<typeof useEndpointsStore>['endpoints'];
}): GeneratorBuildContext {
  const rolePromptById = new Map(
    buildRolePromptCatalog().map((entry) => [entry.id, entry.text]),
  );
  const capsuleByKey = new Map(
    deps.capsules.map((c) => [`${c.id}@${c.version}`, c]),
  );

  return {
    allowCapsules: deps.allowCapsules,
    applyMode: deps.applyMode,
    ...(deps.existingPipeline ? {existingPipeline: deps.existingPipeline} : {}),

    instantiateSuggestion(suggestionId, existingNamespaces, existingSteps) {
      const suggestion = ALL_SUGGESTIONS.find((s) => s.id === suggestionId);
      if (!suggestion) return null;
      return instantiateSuggestion(suggestion, existingNamespaces, existingSteps);
    },

    getRolePrompt(rolePromptId) {
      return rolePromptById.get(rolePromptId) ?? null;
    },

    resolveCapsule(capsuleId, capsuleVersion) {
      return capsuleByKey.get(`${capsuleId}@${capsuleVersion}`);
    },

    resolveModelAssignments({steps, requests}) {
      void buildGeneratorModelCatalog({models: deps.models, endpoints: deps.endpoints});
      return resolveGeneratorModelAssignments({
        steps,
        requests,
        models: deps.models,
        endpoints: deps.endpoints,
      });
    },
  };
}
