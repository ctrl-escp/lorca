import type {ModelUsageBucket, PipelineStep} from '@lorca/core';
import {BUILTIN_SUGGESTIONS, instantiateSuggestion} from '@lorca/capsules';
import type {PipelineSuggestion} from '@lorca/capsules';
import {autoAssignModelsToSteps} from '@lorca/endpoints';
import {useModelsStore} from '../stores/models.js';
import {usePipelineEditorStore} from '../stores/pipelineEditor.js';

export type SuggestionInsertMode = 'before' | 'after' | 'append' | 'at-index' | 'new';

export function useSuggestionInsert() {
  const editorStore = usePipelineEditorStore();
  const modelsStore = useModelsStore();

  function prepareSteps(
    steps: ReturnType<typeof instantiateSuggestion>,
    preferredBucket?: ModelUsageBucket,
  ): PipelineStep[] {
    return autoAssignModelsToSteps(steps, modelsStore.models, preferredBucket);
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

  function insertSuggestion(suggestion: PipelineSuggestion, mode: SuggestionInsertMode, index?: number) {
    const existingNamespaces = new Set(editorStore.steps.map((s) => s.outputNamespace));
    const rawSteps = instantiateSuggestion(suggestion, existingNamespaces);
    const newSteps = prepareSteps(rawSteps, suggestion.preferredModelBucket);

    if (mode === 'new') {
      const hasContent = editorStore.steps.length > 0 || editorStore.pipeline.input.raw.trim();
      if (hasContent && !window.confirm(
        `Replace the current pipeline with "${suggestion.name}"?\n\nExisting steps and prompt will be cleared.`,
      )) return false;
      editorStore.replaceSteps(newSteps, `New pipeline from "${suggestion.name}"`);
      return true;
    }

    if (mode === 'at-index') {
      insertStepsAtIndex(index ?? editorStore.steps.length, newSteps);
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

  function insertSuggestionById(suggestionId: string, mode: SuggestionInsertMode, index?: number): boolean {
    const suggestion = BUILTIN_SUGGESTIONS.find((s) => s.id === suggestionId);
    if (!suggestion) return false;
    return insertSuggestion(suggestion, mode, index);
  }

  return {insertSuggestion, insertSuggestionById, insertStepsAtIndex};
}
