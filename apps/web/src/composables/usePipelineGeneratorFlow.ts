import {ref, computed} from 'vue';
import type {PipelineStep} from '@lorca/core';
import {ALL_SUGGESTIONS, LORCA_PIPELINE_GENERATOR_ID, resolveModelCallSuggestedBuckets} from '@lorca/capsules';
import {applyModelRemapsToSteps} from '@lorca/storage';
import {
  buildStepsFromGeneratorPlan,
  generatorCapsuleCompatible,
  usePipelineGenerator,
} from './usePipelineGenerator.js';
import {usePipelineEditorStore} from '../stores/pipelineEditor.js';
import {useActiveRunStore} from '../stores/activeRun.js';
import {useCapsulesStore} from '../stores/capsules.js';
import {useUiStore} from '../stores/ui.js';
import type {MissingModelReference, ModelRemap} from '../stores/importExport.js';

export function usePipelineGeneratorFlow() {
  const editorStore = usePipelineEditorStore();
  const runStore = useActiveRunStore();
  const capsulesStore = useCapsulesStore();
  const uiStore = useUiStore();
  const pipelineGenerator = usePipelineGenerator();

  const generatorModalOpen = ref(false);
  const generatorLoading = ref(false);
  const generatorError = ref<string | null>(null);
  const generatorRawResponse = ref<string | null>(null);
  const generatorPreviewSteps = ref<PipelineStep[]>([]);
  const generatorWarnings = ref<string[]>([]);
  const generatedModelRemapOpen = ref(false);
  let generatorAbortController: AbortController | null = null;

  const generatorCapsules = computed(() => {
    const all = [...capsulesStore.lockedCapsules, ...capsulesStore.draftCapsules];
    const seen = new Set<string>();
    return all.filter((capsule) => {
      if (seen.has(capsule.id)) return false;
      seen.add(capsule.id);
      return generatorCapsuleCompatible(capsule);
    });
  });

  const defaultGeneratorCapsuleId = computed(() =>
    generatorCapsules.value.find((capsule) => capsule.id === LORCA_PIPELINE_GENERATOR_ID)?.id
    ?? generatorCapsules.value[0]?.id
    ?? '',
  );

  const generatorPreviewLabels = computed(() =>
    generatorPreviewSteps.value.map((step) => step.label),
  );

  const generatedModelRefs = computed<MissingModelReference[]>(() =>
    collectGeneratedModelRefs(generatorPreviewSteps.value),
  );

  const generatorManualImportAvailable = computed(() =>
    generatorError.value !== null && generatorRawResponse.value !== null,
  );

  function openGeneratorModal() {
    generatorError.value = null;
    generatorRawResponse.value = null;
    generatorPreviewSteps.value = [];
    generatorWarnings.value = [];
    generatorModalOpen.value = true;
  }

  function closeGeneratorModal() {
    generatorAbortController?.abort();
    generatorAbortController = null;
    generatorLoading.value = false;
    generatorModalOpen.value = false;
  }

  function abortGeneratorOnUnmount() {
    generatorAbortController?.abort();
  }

  async function handleGeneratePipeline(payload: {description: string; capsuleId: string}) {
    generatorAbortController?.abort();
    const controller = new AbortController();
    generatorAbortController = controller;
    generatorLoading.value = true;
    generatorError.value = null;
    generatorRawResponse.value = null;
    generatorPreviewSteps.value = [];
    generatorWarnings.value = [];

    const result = await pipelineGenerator.generatePipelinePlan(
      payload.capsuleId,
      payload.description,
      controller.signal,
    );
    if (generatorAbortController === controller) generatorAbortController = null;
    generatorLoading.value = false;

    if (!result.ok) {
      generatorError.value = result.message;
      generatorRawResponse.value = result.rawResponse ?? null;
      return;
    }

    const steps = buildStepsFromGeneratorPlan(result.entries);
    if (steps.length === 0) {
      generatorError.value = "Couldn't build steps from the generated plan";
      generatorRawResponse.value = result.rawResponse;
      return;
    }

    generatorRawResponse.value = result.rawResponse;
    generatorWarnings.value = result.unknownSuggestionIds;
    generatorPreviewSteps.value = steps;
  }

  function openGeneratedModelRemap() {
    if (generatorPreviewSteps.value.length === 0) return;
    generatedModelRemapOpen.value = true;
  }

  function applyGeneratedPipeline(remaps: Record<string, ModelRemap>) {
    const steps = applyModelRemapsToSteps(generatorPreviewSteps.value, remaps);
    editorStore.replaceSteps(steps, 'Build pipeline from description');
    runStore.reset();
    generatedModelRemapOpen.value = false;
    generatorModalOpen.value = false;
    generatorPreviewSteps.value = [];
    generatorRawResponse.value = null;
    generatorError.value = null;
    generatorWarnings.value = [];
    uiStore.setRightPaneTab('inspector');
  }

  function openManualImportFromGenerator(onOpenImport: () => void) {
    generatorModalOpen.value = false;
    onOpenImport();
  }

  return {
    generatorModalOpen,
    generatorLoading,
    generatorError,
    generatorRawResponse,
    generatorPreviewSteps,
    generatorWarnings,
    generatedModelRemapOpen,
    generatorCapsules,
    defaultGeneratorCapsuleId,
    generatorPreviewLabels,
    generatedModelRefs,
    generatorManualImportAvailable,
    openGeneratorModal,
    closeGeneratorModal,
    abortGeneratorOnUnmount,
    handleGeneratePipeline,
    openGeneratedModelRemap,
    applyGeneratedPipeline,
    openManualImportFromGenerator,
  };
}

function collectGeneratedModelRefs(steps: PipelineStep[]): MissingModelReference[] {
  const refs: MissingModelReference[] = [];
  const visit = (step: PipelineStep) => {
    if (step.config.type === 'model-call') {
      refs.push({
        key: step.id,
        nodeId: step.id,
        endpointId: '',
        modelName: step.config.modelRef.kind === 'slot' ? '' : step.config.modelRef.modelName,
        label: `Model call ${step.label || step.id}`,
        suggestedBuckets: resolveModelCallSuggestedBuckets(step),
      });
    }
    if (step.config.type === 'capsule-instance' && step.config.modelSlotBindings) {
      const suggestion = ALL_SUGGESTIONS.find((item) => item.id === step.createdFromSuggestionId);
      for (const [slotName, modelRef] of Object.entries(step.config.modelSlotBindings)) {
        refs.push({
          key: `${step.id}::${slotName}`,
          nodeId: step.id,
          endpointId: '',
          modelName: modelRef.kind === 'slot' ? '' : modelRef.modelName,
          label: `Capsule slot ${slotName} (${step.label || suggestion?.name || step.id})`,
          suggestedBuckets: suggestion?.preferredModelBucket ? [suggestion.preferredModelBucket] : ['general'],
        });
      }
    }
    if (step.config.type === 'loop-group') {
      for (const inner of step.config.steps) visit(inner);
    }
  };
  for (const step of steps) visit(step);
  return refs;
}
