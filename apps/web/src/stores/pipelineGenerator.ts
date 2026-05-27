import {defineStore} from 'pinia';
import {ref, computed, type Ref, type ComputedRef} from 'vue';
import type {PipelineStep} from '@lorca/core';
import {
  buildStepsFromGeneratorPlan,
  isDefaultPipelineStub,
  parsePipelineGeneratorPlan,
  type GeneratorApplyMode,
} from '@lorca/pipeline';
import {composeGeneratorBuildContext} from '../generator/composeGeneratorBuildContext.js';
import {usePipelineEditorStore} from './pipelineEditor.js';

/** Local session shapes — avoids vue-tsc leaking @lorca/pipeline internal module paths. */
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

  const hasSession = computed(() =>
    Boolean(description.value || rawResponse.value || buildResult.value),
  );

  const unresolvedModels = computed((): GeneratorSessionUnresolvedModel[] =>
    buildResult.value?.unresolvedModels ?? [],
  );

  const canApply = computed(() =>
    Boolean(buildResult.value?.ok) &&
    previewSteps.value.length > 0 &&
    unresolvedModels.value.length === 0 &&
    !(buildResult.value?.errors.length),
  );

  const canResolveModels = computed(() =>
    Boolean(buildResult.value?.ok) &&
    previewSteps.value.length > 0 &&
    unresolvedModels.value.length > 0 &&
    !(buildResult.value?.errors.length),
  );

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

  function setRawResponse(text: string) {
    rawResponse.value = text;
    errorMessage.value = '';
    parseMessage.value = '';

    const editor = usePipelineEditorStore();
    const hasPipelineContext =
      applyMode.value === 'append' && !isDefaultPipelineStub(editor.pipeline);

    const parsed = parsePipelineGeneratorPlan(text, {
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

  function applyPreviewToEditor() {
    if (!canApply.value || previewSteps.value.length === 0) return;
    const editor = usePipelineEditorStore();
    if (applyMode.value === 'append') {
      editor.replaceSteps(
        [...editor.pipeline.steps, ...previewSteps.value],
        'Append generated steps',
      );
    } else {
      editor.replaceSteps(previewSteps.value);
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
    hasSession,
    unresolvedModels,
    canApply,
    canResolveModels,
    clearAll,
    setRawResponse,
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
  hasSession: ComputedRef<boolean>;
  unresolvedModels: ComputedRef<GeneratorSessionUnresolvedModel[]>;
  canApply: ComputedRef<boolean>;
  canResolveModels: ComputedRef<boolean>;
  clearAll: () => void;
  setRawResponse: (text: string) => void;
  applyPreviewToEditor: () => void;
};
