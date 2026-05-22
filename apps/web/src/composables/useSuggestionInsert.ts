import type {ModelUsageBucket, PipelineStep} from '@lorca/core';
import {ALL_SUGGESTIONS, instantiateSuggestion} from '@lorca/capsules';
import type {PipelineSuggestion} from '@lorca/capsules';
import {autoAssignModelsToSteps} from '@lorca/endpoints';
import {useModelsStore} from '../stores/models.js';
import {useEndpointsStore} from '../stores/endpoints.js';
import {usePipelineEditorStore} from '../stores/pipelineEditor.js';

export type SuggestionInsertMode = 'before' | 'after' | 'append' | 'at-index' | 'new';

export function useSuggestionInsert() {
  const editorStore = usePipelineEditorStore();
  const modelsStore = useModelsStore();
  const endpointsStore = useEndpointsStore();

  function prepareSteps(
    steps: ReturnType<typeof instantiateSuggestion>,
    preferredBucket?: ModelUsageBucket,
  ): PipelineStep[] {
    const disabledEpIds = new Set(endpointsStore.endpoints.filter((e) => !e.enabled).map((e) => e.id));
    const enabledModels = modelsStore.models.filter((m) => m.enabled !== false && !disabledEpIds.has(m.endpointId));
    return autoAssignModelsToSteps(steps, enabledModels, preferredBucket);
  }

  function insertStepsAfterAnchor(anchorId: string | null, newSteps: PipelineStep[]) {
    if (newSteps.length === 0) return;
    if (anchorId) {
      let afterId = anchorId;
      for (const step of newSteps) {
        afterId = editorStore.insertStepAfter(afterId, step);
      }
      editorStore.selectStep(afterId);
    } else {
      for (const step of newSteps) {
        editorStore.appendStep(step);
      }
      editorStore.selectStep(newSteps[newSteps.length - 1]!.id);
    }
  }

  function insertStepsBeforeAnchor(anchorId: string, newSteps: PipelineStep[]) {
    if (newSteps.length === 0) return;
    for (const step of newSteps) {
      editorStore.insertStepBefore(anchorId, step);
    }
    editorStore.selectStep(newSteps[newSteps.length - 1]!.id);
  }

  function insertStepsAtIndex(index: number, newSteps: PipelineStep[]) {
    if (newSteps.length === 0) return;
    const steps = editorStore.steps;
    if (steps.length === 0 || index <= 0) {
      insertStepsAfterAnchor(null, newSteps);
      return;
    }
    if (index >= steps.length) {
      insertStepsAfterAnchor(steps[steps.length - 1]!.id, newSteps);
      return;
    }
    insertStepsBeforeAnchor(steps[index]!.id, newSteps);
  }

  async function insertSuggestion(
    suggestion: PipelineSuggestion,
    mode: SuggestionInsertMode,
    options?: {index?: number; confirmReplace?: () => Promise<boolean>},
  ): Promise<boolean> {
    const existingNamespaces = new Set(editorStore.steps.map((s) => s.outputNamespace));
    const existingSteps = mode === 'new' ? undefined : editorStore.steps;
    const rawSteps = instantiateSuggestion(suggestion, existingNamespaces, existingSteps);
    const newSteps = prepareSteps(rawSteps, suggestion.preferredModelBucket);

    if (mode === 'new') {
      const hasContent = editorStore.steps.length > 0 || editorStore.pipeline.input.raw.trim();
      if (hasContent) {
        const confirmed = options?.confirmReplace
          ? await options.confirmReplace()
          : true;
        if (!confirmed) return false;
      }
      editorStore.replaceSteps(newSteps, `New pipeline from "${suggestion.name}"`);
      return true;
    }

    if (mode === 'at-index') {
      insertStepsAtIndex(options?.index ?? editorStore.steps.length, newSteps);
      return true;
    }

    const anchorId = mode === 'append' ? null : editorStore.selectedStepId;
    if (mode === 'before') {
      if (!anchorId) return false;
      insertStepsBeforeAnchor(anchorId, newSteps);
      return true;
    }
    insertStepsAfterAnchor(anchorId, newSteps);
    return true;
  }

  async function insertSuggestionById(suggestionId: string, mode: SuggestionInsertMode, index?: number): Promise<boolean> {
    const suggestion = ALL_SUGGESTIONS.find((s) => s.id === suggestionId);
    if (!suggestion) return false;
    return insertSuggestion(suggestion, mode, index !== undefined ? {index} : undefined);
  }

  return {insertSuggestion, insertSuggestionById, insertStepsAtIndex};
}
