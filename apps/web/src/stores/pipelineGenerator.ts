import {defineStore} from 'pinia';
import {ref, computed, watch, type Ref, type ComputedRef} from 'vue';
import type {PipelineStep} from '@lorca/core';
import {applyModelRemapsToSteps, type ModelRemap} from '@lorca/storage';
import {
  buildStepsFromGeneratorPlan,
  isDefaultPipelineStub,
  parsePipelineGeneratorPlan,
  type GeneratorApplyMode,
} from '@lorca/pipeline';
import {composeGeneratorBuildContext} from '../generator/composeGeneratorBuildContext.js';
import {usePipelineGenerator} from '../composables/usePipelineGenerator.js';
import {usePipelineEditorStore} from './pipelineEditor.js';
import {collectGeneratorMissingModelRefs} from '../utils/generatorMissingModelRefs.js';

export interface GeneratorSessionUnresolvedModel {
  stepId: string;
  stepKey: string;
  slotName?: string;
  reason: string;
}

export interface GeneratorSessionBuildResult {
  ok: boolean;
  steps: PipelineStep[];
  errors: string[];
  unresolvedModels: GeneratorSessionUnresolvedModel[];
  assumptions: string[];
  warnings: string[];
}

export const usePipelineGeneratorStore = defineStore('pipelineGenerator', () => {
  const description = ref('');
  const rawResponse = ref('');
  const applyMode = ref<GeneratorApplyMode>('replace');
  const allowCapsules = ref(false);
  const refinePreviousPlan = ref(false);
  const loading = ref(false);
  const errorMessage = ref('');
  const parseMessage = ref('');
  const buildResult = ref<GeneratorSessionBuildResult | null>(null);
  const previewSteps = ref<PipelineStep[]>([]);
  const modalOpen = ref(false);

  let abortController: AbortController | null = null;

  const hasSession = computed(() =>
    Boolean(description.value || rawResponse.value || buildResult.value),
  );

  const previewLabels = computed(() => previewSteps.value.map((s) => s.label));

  const assumptions = computed(() => buildResult.value?.assumptions ?? []);
  const planWarnings = computed(() => buildResult.value?.warnings ?? []);

  const validationErrors = computed(() => {
    const errs: string[] = [];
    if (parseMessage.value) errs.push(parseMessage.value);
    if (buildResult.value?.errors.length) errs.push(...buildResult.value.errors);
    return errs;
  });

  const unresolvedModels = computed((): GeneratorSessionUnresolvedModel[] =>
    buildResult.value?.unresolvedModels ?? [],
  );

  const missingModelRefs = computed(() => collectGeneratorMissingModelRefs(previewSteps.value));

  const canApply = computed(() =>
    Boolean(buildResult.value?.ok) &&
    previewSteps.value.length > 0 &&
    missingModelRefs.value.length === 0 &&
    validationErrors.value.length === 0,
  );

  const canResolveModels = computed(() =>
    Boolean(buildResult.value?.ok) &&
    previewSteps.value.length > 0 &&
    missingModelRefs.value.length > 0 &&
    validationErrors.value.length === 0,
  );

  const canGenerate = computed(() => description.value.trim().length > 0 && !loading.value);

  const manualImportAvailable = computed(() =>
    Boolean(errorMessage.value && rawResponse.value),
  );

  function openModal() {
    modalOpen.value = true;
  }

  function closeModal() {
    abortController?.abort();
    abortController = null;
    loading.value = false;
    modalOpen.value = false;
  }

  function clearAll() {
    description.value = '';
    rawResponse.value = '';
    applyMode.value = 'replace';
    allowCapsules.value = false;
    refinePreviousPlan.value = false;
    loading.value = false;
    errorMessage.value = '';
    parseMessage.value = '';
    buildResult.value = null;
    previewSteps.value = [];
  }

  function ingestBuild(raw: string) {
    rawResponse.value = raw;
    errorMessage.value = '';
    parseMessage.value = '';

    const editor = usePipelineEditorStore();
    const hasPipelineContext =
      applyMode.value === 'append' && !isDefaultPipelineStub(editor.pipeline);

    const parsed = parsePipelineGeneratorPlan(raw, {
      allowCapsules: allowCapsules.value,
      applyMode: applyMode.value,
      hasPipelineContext,
    });
    if (!parsed.ok) {
      parseMessage.value = parsed.message;
      buildResult.value = null;
      previewSteps.value = [];
      return;
    }

    const context = composeGeneratorBuildContext({
      allowCapsules: allowCapsules.value,
      applyMode: applyMode.value,
      ...(applyMode.value === 'append' ? {existingPipeline: editor.pipeline} : {}),
    });
    const built = buildStepsFromGeneratorPlan(parsed.plan, context);
    buildResult.value = {
      ok: built.ok,
      steps: built.steps,
      errors: built.errors,
      unresolvedModels: built.unresolvedModels,
      assumptions: built.assumptions,
      warnings: built.warnings,
    };
    previewSteps.value = built.steps;
    if (!built.ok && built.errors.length > 0) {
      parseMessage.value = built.errors.join('; ');
    }
  }

  async function runGenerate() {
    const text = description.value.trim();
    if (!text) return;

    abortController?.abort();
    const controller = new AbortController();
    abortController = controller;

    loading.value = true;
    errorMessage.value = '';
    parseMessage.value = '';

    const generator = usePipelineGenerator();
    const refine = refinePreviousPlan.value;
    const result = await generator.generatePipelinePlan(text, controller.signal, {
      allowCapsules: allowCapsules.value,
      applyMode: applyMode.value,
      ...(refine ? {
        refinePreviousPlan: true,
        previousPlanJson: rawResponse.value,
        previousErrors: [
          ...validationErrors.value,
          ...unresolvedModels.value.map((u) => u.reason),
        ],
      } : {}),
    });

    if (abortController === controller) abortController = null;
    loading.value = false;

    if (!result.ok) {
      errorMessage.value = result.message;
      if (result.rawResponse) ingestBuild(result.rawResponse);
      return;
    }

    ingestBuild(result.rawResponse);
    if (!buildResult.value?.ok && previewSteps.value.length === 0) {
      errorMessage.value = parseMessage.value || "Couldn't build steps from the generated plan";
    }
  }

  function applyRemaps(remaps: Record<string, ModelRemap>) {
    previewSteps.value = applyModelRemapsToSteps(previewSteps.value, remaps);
    const missing = collectGeneratorMissingModelRefs(previewSteps.value);
    if (buildResult.value) {
      buildResult.value = {
        ...buildResult.value,
        steps: previewSteps.value,
        unresolvedModels: missing.map((m) => {
          const slot = m.key.includes('::') ? m.key.split('::')[1] : undefined;
          return {
            stepId: m.nodeId,
            stepKey: m.nodeId,
            reason: 'Model not configured',
            ...(slot ? {slotName: slot} : {}),
          };
        }),
        ok: buildResult.value.errors.length === 0 && missing.length === 0,
      };
    }
  }

  watch([applyMode, allowCapsules], () => {
    if (rawResponse.value) ingestBuild(rawResponse.value);
  });

  function applyPreviewToEditor() {
    if (!canApply.value || previewSteps.value.length === 0) return;
    const editor = usePipelineEditorStore();
    if (applyMode.value === 'append') {
      editor.replaceSteps(
        [...editor.pipeline.steps, ...previewSteps.value],
        'Append generated steps',
      );
    } else {
      editor.replaceSteps(previewSteps.value, 'Build pipeline from description');
    }
  }

  return {
    description,
    rawResponse,
    applyMode,
    allowCapsules,
    refinePreviousPlan,
    loading,
    errorMessage,
    parseMessage,
    buildResult,
    previewSteps,
    modalOpen,
    hasSession,
    previewLabels,
    assumptions,
    planWarnings,
    validationErrors,
    unresolvedModels,
    missingModelRefs,
    canApply,
    canResolveModels,
    canGenerate,
    manualImportAvailable,
    openModal,
    closeModal,
    clearAll,
    ingestBuild,
    runGenerate,
    applyRemaps,
    applyPreviewToEditor,
  };
});

export type PipelineGeneratorStore = {
  description: Ref<string>;
  rawResponse: Ref<string>;
  applyMode: Ref<GeneratorApplyMode>;
  allowCapsules: Ref<boolean>;
  refinePreviousPlan: Ref<boolean>;
  loading: Ref<boolean>;
  errorMessage: Ref<string>;
  parseMessage: Ref<string>;
  buildResult: Ref<GeneratorSessionBuildResult | null>;
  previewSteps: Ref<PipelineStep[]>;
  modalOpen: Ref<boolean>;
  hasSession: ComputedRef<boolean>;
  previewLabels: ComputedRef<string[]>;
  assumptions: ComputedRef<string[]>;
  planWarnings: ComputedRef<string[]>;
  validationErrors: ComputedRef<string[]>;
  unresolvedModels: ComputedRef<GeneratorSessionUnresolvedModel[]>;
  missingModelRefs: ComputedRef<ReturnType<typeof collectGeneratorMissingModelRefs>>;
  canApply: ComputedRef<boolean>;
  canResolveModels: ComputedRef<boolean>;
  canGenerate: ComputedRef<boolean>;
  manualImportAvailable: ComputedRef<boolean>;
  openModal: () => void;
  closeModal: () => void;
  clearAll: () => void;
  runGenerate: () => Promise<void>;
  applyRemaps: (remaps: Record<string, ModelRemap>) => void;
  applyPreviewToEditor: () => void;
};
