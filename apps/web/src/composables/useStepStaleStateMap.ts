import {computed, toValue} from 'vue';
import type {ComputedRef, MaybeRefOrGetter} from 'vue';
import {computeStepStaleStates} from '@lorca/pipeline';
import type {StepStaleState} from '@lorca/pipeline';
import {useActiveRunStore} from '../stores/activeRun.js';
import {useCapsuleRunStore} from '../stores/capsuleRun.js';
import {useCapsulesStore} from '../stores/capsules.js';
import {useCapsuleStepEditorStore} from '../stores/capsuleStepEditor.js';
import {usePipelineEditorStore} from '../stores/pipelineEditor.js';
import {useUiStore} from '../stores/ui.js';

export function useStepStaleStateMap(livePrompt: MaybeRefOrGetter<string>): {
  map: ComputedRef<Record<string, StepStaleState>>;
  stateFor: (stepId: string) => StepStaleState | null;
} {
  const ui = useUiStore();
  const capsulesStore = useCapsulesStore();
  const pipelineEditorStore = usePipelineEditorStore();
  const capsuleEditorStore = useCapsuleStepEditorStore();
  const pipelineRunStore = useActiveRunStore();
  const capsuleRunStore = useCapsuleRunStore();

  // Both stores are instantiated once here; the computed selects between them
  // reactively based on ui.editorContext, so context switches work correctly.
  const map = computed((): Record<string, StepStaleState> => {
    const editor = ui.editorContext === 'capsule' ? capsuleEditorStore : pipelineEditorStore;
    const runStore = ui.editorContext === 'capsule' ? capsuleRunStore : pipelineRunStore;
    const states = computeStepStaleStates(
      editor.pipeline,
      runStore.runSnapshotContext,
      toValue(livePrompt),
      (id, version) => capsulesStore.getCapsule(id, version),
    );
    return Object.fromEntries(states.map((s) => [s.stepId, s]));
  });

  function stateFor(stepId: string): StepStaleState | null {
    return map.value[stepId] ?? null;
  }

  return {map, stateFor};
}
