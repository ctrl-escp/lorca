import {ref, computed} from 'vue';
import type {PipelineStep} from '@lorca/core';
import {usePipelineGeneratorStore} from '../stores/pipelineGenerator.js';
import {useActiveRunStore} from '../stores/activeRun.js';
import {useUiStore} from '../stores/ui.js';
import type {ModelRemap} from '../stores/importExport.js';
export interface GeneratorPreviewItem {
  label: string;
  modelHint?: string;
}

function modelHintForStep(step: PipelineStep): string | undefined {
  if (step.config.type === 'model-call') {
    const modelRef = step.config.modelRef;
    if (modelRef.kind === 'fixed' && modelRef.endpointId && modelRef.modelName) {
      return `${modelRef.endpointId} · ${modelRef.modelName}`;
    }
    return 'Model not set';
  }
  if (step.config.type === 'capsule-instance' && step.config.modelSlotBindings) {
    const parts = Object.entries(step.config.modelSlotBindings).map(([slot, slotRef]) => {
      if (slotRef.kind === 'fixed' && slotRef.endpointId && slotRef.modelName) {
        return `${slot}: ${slotRef.modelName}`;
      }
      return `${slot}: unset`;
    });
    return parts.length ? parts.join('; ') : undefined;
  }
  return undefined;
}

function flattenPreviewSteps(steps: readonly PipelineStep[]): GeneratorPreviewItem[] {
  const items: GeneratorPreviewItem[] = [];
  function visit(step: PipelineStep) {
    const hint = modelHintForStep(step);
    items.push(hint ? {label: step.label, modelHint: hint} : {label: step.label});
    if (step.config.type === 'loop-group') {
      for (const inner of step.config.steps) visit(inner);
    }
  }
  for (const step of steps) visit(step);
  return items;
}

/** Thin bridge from CenterPane to the Pinia generator session + remap dialog. */
export function usePipelineGeneratorFlow() {
  const store = usePipelineGeneratorStore();
  const runStore = useActiveRunStore();
  const uiStore = useUiStore();
  const generatedModelRemapOpen = ref(false);

  function openGeneratorModal() {
    store.openModal();
  }

  function closeGeneratorModal() {
    store.closeModal();
  }

  function abortGeneratorOnUnmount() {
    store.closeModal();
  }

  async function handleGeneratePipeline() {
    await store.runGenerate();
  }

  function openGeneratedModelRemap() {
    if (!store.canResolveModels) return;
    generatedModelRemapOpen.value = true;
  }

  function applyGeneratedPipeline(remaps: Record<string, ModelRemap>) {
    store.applyRemaps(remaps);
    if (store.canApply) {
      store.applyPreviewToEditor();
      runStore.reset();
      uiStore.setRightPaneTab('inspector');
    }
    generatedModelRemapOpen.value = false;
  }

  function applyGeneratedPipelineDirect() {
    store.applyPreviewToEditor();
    runStore.reset();
    uiStore.setRightPaneTab('inspector');
  }

  function openManualImportFromGenerator(onOpenImport: () => void) {
    store.closeModal();
    onOpenImport();
  }

  const generatorReplacesPipeline = computed(() => store.applyMode === 'replace');

  return {
    generatorModalOpen: computed(() => store.modalOpen),
    generatorLoading: computed(() => store.loading),
    generatorError: computed(() => store.errorMessage || store.parseMessage || null),
    generatorRawResponse: computed(() => store.rawResponse || null),
    generatorPreviewSteps: computed(() => store.previewSteps),
    generatorWarnings: computed(() => store.planWarnings),
    generatorAssumptions: computed(() => store.assumptions),
    generatorValidationErrors: computed(() => store.validationErrors),
    generatedModelRemapOpen,
    generatorPreviewLabels: computed(() => store.previewLabels),
    generatorPreviewItems: computed(() => flattenPreviewSteps(store.previewSteps)),
    generatedModelRefs: computed(() => store.missingModelRefs),
    generatorManualImportAvailable: computed(() => store.manualImportAvailable),
    generatorCanApply: computed(() => store.canApply),
    generatorCanResolveModels: computed(() => store.canResolveModels),
    generatorCanGenerate: computed(() => store.canGenerate),
    generatorApplyMode: computed({
      get: () => store.applyMode,
      set: (v) => { store.applyMode = v; },
    }),
    generatorAllowCapsules: computed({
      get: () => store.allowCapsules,
      set: (v) => { store.allowCapsules = v; },
    }),
    generatorRefinePreviousPlan: computed({
      get: () => store.refinePreviousPlan,
      set: (v) => { store.refinePreviousPlan = v; },
    }),
    generatorDescription: computed({
      get: () => store.description,
      set: (v) => { store.description = v; },
    }),
    generatorReplacesPipeline,
    openGeneratorModal,
    closeGeneratorModal,
    abortGeneratorOnUnmount,
    handleGeneratePipeline,
    openGeneratedModelRemap,
    applyGeneratedPipeline,
    applyGeneratedPipelineDirect,
    openManualImportFromGenerator,
    clearGeneratorSession: () => store.clearAll(),
  };
}
