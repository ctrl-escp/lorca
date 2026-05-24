<template>
  <div class="center-pane">
    <div class="center-toolbar">
      <button class="btn btn-secondary btn-new" type="button" title="Start a new empty pipeline" @click="handleNew">New</button>
      <!-- Pipeline switcher (shown when multiple pipelines exist) -->
      <PipelineSelector
        v-if="pipelinesStore.pipelines.length > 1"
        :pipelines="pipelinesStore.pipelines"
        :active-id="pipelinesStore.activePipelineId"
        @select="handlePipelineSelect"
        @delete="handlePipelineDelete"
      />
      <input
        v-else
        class="pipeline-name"
        v-model="localPipelineName"
        placeholder="Pipeline name"
        @blur="commitPipelineName"
        @keydown.enter="commitPipelineName"
      />
      <div class="run-controls" :class="{ 'is-running': runStore.isRunning }">
        <div class="pipeline-action-controls">
          <!-- Build is always visible -->
          <button class="btn btn-secondary" type="button" title="Generate a pipeline from a natural-language description" @click="handleBuildFromDescription">✨ Build from description…</button>
          <!-- Progressive overflow buttons: each revealed at a wider breakpoint -->
          <button class="btn btn-secondary ovf-inline ovf-1" type="button" title="Wrap selected steps in a retry loop (refine → verify)" @click="handleWrapInRetryLoop">Wrap in retry loop</button>
          <button class="btn btn-secondary ovf-inline ovf-2" type="button" title="Lock selected steps, or the whole pipeline, as a Capsule" @click="handleLockSelectionAsCapsule">Lock as Capsule</button>
          <button class="btn btn-secondary ovf-inline ovf-3" type="button" @click="handleExport">Export</button>
          <button class="btn btn-secondary ovf-inline ovf-4" type="button" @click="handleImport">Import</button>
          <!-- More dropdown: contains only the buttons not yet shown inline -->
          <div class="more-menu-wrap" ref="moreMenuRef">
            <button class="btn btn-secondary" type="button" @click="moreMenuOpen = !moreMenuOpen">⋯ More</button>
            <div v-if="moreMenuOpen" class="more-menu-dropdown">
              <button class="more-menu-item ovf-drop ovf-drop-1" type="button" @click="handleWrapInRetryLoop">Wrap in retry loop</button>
              <button class="more-menu-item ovf-drop ovf-drop-2" type="button" @click="handleLockSelectionAsCapsule">Lock as Capsule</button>
              <button class="more-menu-item ovf-drop ovf-drop-3" type="button" @click="handleExport">Export</button>
              <button class="more-menu-item ovf-drop ovf-drop-4" type="button" @click="handleImport">Import</button>
            </div>
          </div>
        </div>
        <div class="execute-controls">
          <label v-if="runStore.isRunning" class="follow-run-label" title="Auto-scroll step selection to the running step">
            <input type="checkbox" v-model="followRunLive" />
            <span class="follow-run-text">Follow</span>
          </label>
          <button
            class="btn btn-run"
            :disabled="runStore.isRunning || !canRun"
            :title="runButtonTitle"
            @click="handleRun"
          >
            {{ runStore.isRunning ? 'Running…' : 'Execute Pipeline' }}
          </button>
          <button class="btn btn-cancel" v-if="runStore.isRunning" @click="runStore.cancel">Cancel</button>
        </div>
      </div>
    </div>

    <!-- Inline error banner for extraction/conversion failures -->
    <div v-if="inlineError" class="inline-error-banner">
      {{ inlineError }}
      <button type="button" class="inline-error-close" @click="inlineError = null">×</button>
    </div>

    <!-- User prompt input -->
    <div class="user-prompt-bar">
      <label class="prompt-label">Prompt</label>
      <textarea
        class="user-prompt-input"
        v-model="userPrompt"
        placeholder="Enter your prompt…"
        rows="2"
        @focus="editorStore.beginInputEdit()"
        @input="onUserPromptInput(($event.target as HTMLTextAreaElement).value)"
        @blur="editorStore.commitUserPrompt(userPrompt)"
      />
    </div>

    <ChainEditor
      :steps="editorStore.steps"
      :selected-step-id="editorStore.selectedStepId"
      :selected-loop-inner-step-id="editorStore.selectedLoopInnerStepId"
      :selected-inline-capsule-inner-step-id="editorStore.selectedInlineCapsuleInnerStepId"
      :trace="runStore.trace"
      :step-states="stepStates"
      :run-partial="runStore.partial"
      :final-artifact-key="finalArtifactKey"
      :show-capsule-add="true"
      :show-undo-redo="true"
      :can-undo="editorStore.canUndo"
      :can-redo="editorStore.canRedo"
      :last-undo-label="editorStore.lastUndoLabel"
      :last-redo-label="editorStore.lastRedoLabel"
      :selection-range="selectionRange"
      :run-snapshots="runStore.snapshots"
      :artifacts="runStore.artifacts"
      :run-status="runStore.status"
      :run-error="runStore.error"
      :accept-suggestion-drop="true"
      :disabled-model-step-ids="stepsWithDisabledModel"
      :partial-run-target-step-id="runStore.partialRunTargetStepId"
      @select="handleSelectStep"
      @select-loop-inner="handleSelectLoopInner"
      @select-inline-capsule-inner="handleSelectInlineCapsuleInner"
      @spread-capsule="handleSpreadCapsule"
      @collapse-inline-capsule="editorStore.collapseInlineCapsule"
      @lock-inline-capsule="handleLockInlineCapsule"
      @detach-capsule="handleDetachCapsule"
      @reorder="handleReorder"
      @drop-suggestion="handleDropSuggestion"
      @append="handleAppend"
      @insert-after="handleInsertAfter"
      @insert-at="handleInsertAt"
      @move-up="handleMoveUp"
      @move-down="handleMoveDown"
      @duplicate="handleDuplicate"
      @toggle-enabled="handleToggleEnabled"
      @delete="editorStore.deleteStep"
      @run-up-to="handleRunUpTo"
      @run-from="handleRunFromStep"
      @run-only-step="handleRunOnlyStep"
      @update-step-comment="handleUpdateStepComment"
      @undo="editorStore.undo"
      @redo="editorStore.redo"
    />

    <!-- Dialogs -->
    <ExportModal
      :open="exportModal.open"
      title="Export Pipeline"
      :json="exportModal.json"
      :filename="exportModal.filename"
      :show-step-output-option="true"
      :has-step-outputs="hasStepOutputs"
      :include-step-outputs="exportModal.includeStepOutputs"
      @update:include-step-outputs="setExportStepOutputs"
      @close="exportModal.open = false"
    />
    <ImportModal
      :open="importModalOpen"
      kind="pipeline"
      @close="importModalOpen = false"
      @submit="handleImportSubmit"
    />
    <PipelineGeneratorModal
      :open="generatorModalOpen"
      :generator-capsules="generatorCapsules"
      :default-capsule-id="defaultGeneratorCapsuleId"
      :loading="generatorLoading"
      :error-message="generatorError"
      :raw-response="generatorRawResponse"
      :preview-labels="generatorPreviewLabels"
      :warnings="generatorWarnings"
      :manual-import-available="generatorManualImportAvailable"
      @close="closeGeneratorModal"
      @generate="handleGeneratePipeline"
      @apply="openGeneratedModelRemap"
      @manual-import="openManualImportFromGenerator"
    />
    <ImportRemapDialog
      v-if="generatedModelRemapOpen"
      :open="true"
      kind="pipeline"
      :missing-models="generatedModelRefs"
      :models="modelsStore.models"
      :endpoints="endpointsStore.endpoints"
      :replaces-active-pipeline="true"
      @cancel="generatedModelRemapOpen = false"
      @confirm="applyGeneratedPipeline"
    />
    <ConfirmDialog
      :open="confirmState.open"
      :title="confirmState.title"
      :message="confirmState.message"
      :confirm-label="confirmState.confirmLabel"
      :destructive="confirmState.destructive"
      @confirm="resolveConfirm(true)"
      @cancel="resolveConfirm(false)"
    />
    <PromptDialog
      :open="promptState.open"
      :title="promptState.title"
      :label="promptState.label"
      :default-value="promptState.defaultValue"
      confirm-label="Save"
      @confirm="resolvePrompt"
      @cancel="resolvePrompt(null)"
    />
  </div>
</template>

<script setup lang="ts">
import {ref, computed, watch, onMounted, onUnmounted} from 'vue';
import type {PipelineDefinition, PipelineStep, StepOutputsExport, StepType} from '@lorca/core';
import {useStepStaleStateMap} from '../../composables/useStepStaleStateMap.js';
import {usePipelineEditorStore} from '../../stores/pipelineEditor.js';
import {useActiveRunStore} from '../../stores/activeRun.js';
import {useImportExportStore} from '../../stores/importExport.js';
import {usePipelinesStore} from '../../stores/pipelines.js';
import {useCapsulesStore} from '../../stores/capsules.js';
import {useUiStore} from '../../stores/ui.js';
import {useModelsStore} from '../../stores/models.js';
import {useEndpointsStore} from '../../stores/endpoints.js';
import {pipelineHasConfiguredModel, pipelineStepChainRunReady} from '../../utils/pipelineRunReady.js';
import {autoAssignModelToStep} from '@lorca/endpoints';
import {applyModelRemapsToSteps} from '@lorca/storage';
import {ALL_SUGGESTIONS, LORCA_PIPELINE_GENERATOR_ID, resolveModelCallSuggestedBuckets} from '@lorca/capsules';
import {useSuggestionInsert} from '../../composables/useSuggestionInsert.js';
import {
  buildStepsFromGeneratorPlan,
  generatorCapsuleCompatible,
  usePipelineGenerator,
} from '../../composables/usePipelineGenerator.js';
import ChainEditor from './ChainEditor.vue';
import PipelineSelector from './PipelineSelector.vue';
import {ConfirmDialog, PromptDialog} from '@lorca/ui-kit';
import ExportModal from '../export/ExportModal.vue';
import ImportModal from '../import/ImportModal.vue';
import ImportRemapDialog from '../import/ImportRemapDialog.vue';
import PipelineGeneratorModal from './PipelineGeneratorModal.vue';
import type {MissingModelReference, ModelRemap} from '../../stores/importExport.js';

const props = defineProps<{def: PipelineDefinition}>();
const emit = defineEmits<{update: [def: PipelineDefinition]; new: []}>();

const runStore = useActiveRunStore();
const pipelinesStore = usePipelinesStore();
const capsulesStore = useCapsulesStore();
const uiStore = useUiStore();
const importStore = useImportExportStore();
const editorStore = usePipelineEditorStore();
const modelsStore = useModelsStore();
const endpointsStore = useEndpointsStore();
const suggestionInsert = useSuggestionInsert();
const pipelineGenerator = usePipelineGenerator();
const followRunLive = ref(true);
const inlineError = ref<string | null>(null);

const exportModal = ref<{open: boolean; json: string; filename: string; includeStepOutputs: boolean}>({
  open: false,
  json: '',
  filename: '',
  includeStepOutputs: false,
});
const importModalOpen = ref(false);
const generatorModalOpen = ref(false);
const generatorLoading = ref(false);
const generatorError = ref<string | null>(null);
const generatorRawResponse = ref<string | null>(null);
const generatorPreviewSteps = ref<PipelineStep[]>([]);
const generatorWarnings = ref<string[]>([]);
const generatedModelRemapOpen = ref(false);
let generatorAbortController: AbortController | null = null;

const userPrompt = ref(props.def.input.raw);
const localPipelineName = ref(props.def.name);
const hasStepOutputs = computed(() => Object.keys(runStore.artifacts).length > 0);

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

const stepsWithDisabledModel = computed<Set<string>>(() => {
  const disabledEpIds = new Set(endpointsStore.endpoints.filter((e) => !e.enabled).map((e) => e.id));
  const disabledModelKeys = new Set(
    modelsStore.models.filter((m) => m.enabled === false).map((m) => `${m.endpointId}::${m.providerModelName}`),
  );
  const result = new Set<string>();
  for (const step of editorStore.steps) {
    if (step.config.type !== 'model-call') continue;
    const {modelRef} = step.config;
    if (modelRef.kind === 'fixed') {
      const {endpointId, modelName} = modelRef;
      if (disabledEpIds.has(endpointId) || disabledModelKeys.has(`${endpointId}::${modelName}`)) {
        result.add(step.id);
      }
    } else if (modelRef.kind === 'any-enabled-endpoint') {
      const hasEnabledMatch = modelsStore.models.some((m) =>
        m.providerModelName === modelRef.modelName &&
        m.enabled !== false &&
        !disabledEpIds.has(m.endpointId),
      );
      if (!hasEnabledMatch) {
        result.add(step.id);
      }
    }
  }
  return result;
});
// ── More menu ────────────────────────────────────────────────────────────────

const moreMenuOpen = ref(false);
const moreMenuRef = ref<HTMLElement | null>(null);

function onDocClick(e: MouseEvent) {
  if (moreMenuOpen.value && moreMenuRef.value && !moreMenuRef.value.contains(e.target as Node)) {
    moreMenuOpen.value = false;
  }
}

// ── Dialog helpers ───────────────────────────────────────────────────────────

type ConfirmState = {open: boolean; title: string; message: string; confirmLabel: string; destructive: boolean};
const confirmState = ref<ConfirmState>({open: false, title: '', message: '', confirmLabel: 'OK', destructive: false});
let confirmResolve: ((v: boolean) => void) | null = null;

function showConfirm(opts: {title: string; message: string; confirmLabel?: string; destructive?: boolean}): Promise<boolean> {
  return new Promise((resolve) => {
    confirmResolve = resolve;
    confirmState.value = {open: true, title: opts.title, message: opts.message, confirmLabel: opts.confirmLabel ?? 'OK', destructive: opts.destructive ?? false};
  });
}

function resolveConfirm(value: boolean) {
  confirmState.value = {...confirmState.value, open: false};
  confirmResolve?.(value);
  confirmResolve = null;
}

type PromptState = {open: boolean; title: string; label: string; defaultValue: string};
const promptState = ref<PromptState>({open: false, title: '', label: '', defaultValue: ''});
let promptResolve: ((v: string | null) => void) | null = null;

function showPrompt(opts: {title: string; label: string; defaultValue?: string}): Promise<string | null> {
  return new Promise((resolve) => {
    promptResolve = resolve;
    promptState.value = {open: true, title: opts.title, label: opts.label, defaultValue: opts.defaultValue ?? ''};
  });
}

function resolvePrompt(value: string | null) {
  promptState.value = {...promptState.value, open: false};
  promptResolve?.(value);
  promptResolve = null;
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

onMounted(() => {
  editorStore.loadPipeline(props.def);
  runStore.restoreForPipeline(props.def.id);
  window.addEventListener('keydown', onKeyDown);
  document.addEventListener('click', onDocClick, true);
});

onUnmounted(() => {
  generatorAbortController?.abort();
  window.removeEventListener('keydown', onKeyDown);
  document.removeEventListener('click', onDocClick, true);
});

const onKeyDown = (e: KeyboardEvent) => {
  const mod = e.metaKey || e.ctrlKey;
  if (!mod) return;
  if (e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    if (editorStore.canUndo) editorStore.undo();
  } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
    e.preventDefault();
    if (editorStore.canRedo) editorStore.redo();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (runStore.isRunning) {
      runStore.cancel();
    } else if (canRun.value) {
      void handleRun();
    }
  }
};

watch(() => props.def, (def) => {
  const cur = editorStore.pipeline;
  if (def.id !== cur.id || def.updatedAt !== cur.updatedAt) {
    editorStore.loadPipeline(def);
    userPrompt.value = def.input.raw;
    localPipelineName.value = def.name;
    if (def.id !== cur.id) runStore.restoreForPipeline(def.id);
  }
});

watch(
  () => editorStore.pipeline,
  (newDef) => {
    emit('update', newDef);
  },
  {deep: true},
);

// ── Computeds ────────────────────────────────────────────────────────────────

const finalArtifactKey = computed(() => {
  const steps = editorStore.steps.filter((s) => s.enabled);
  const outputStep = editorStore.pipeline.outputStepId
    ? steps.find((s) => s.id === editorStore.pipeline.outputStepId)
    : steps.at(-1);
  if (!outputStep) return null;
  return `${outputStep.outputNamespace}.${outputStep.primaryOutputName}`;
});

const canRun = computed(() =>
  pipelineStepChainRunReady(editorStore.pipeline, userPrompt.value, capsulesStore.getCapsule),
);

const runButtonTitle = computed(() => {
  if (canRun.value) return 'Run the entire pipeline — ⌘↵';
  const needs: string[] = [];
  if (!userPrompt.value.trim()) needs.push('enter a prompt');
  if (!pipelineHasConfiguredModel(editorStore.pipeline, capsulesStore.getCapsule)) {
    needs.push('configure a model or capsule');
  }
  return needs.length ? `To run: ${needs.join(' and ')}` : 'Configure pipeline to run';
});

const {map: stepStates} = useStepStaleStateMap(userPrompt);

const selectionRange = computed(() => {
  const range = editorStore.getSelectionRange();
  if (!range) return null;
  const ids = editorStore.steps.slice(range.startIndex, range.endIndex + 1).map((s) => s.id);
  return {startIndex: range.startIndex, endIndex: range.endIndex, stepIds: ids};
});

// ── Handlers ─────────────────────────────────────────────────────────────────

function handleSelectStep(stepId: string, extendRange?: boolean) {
  editorStore.selectStep(stepId, extendRange ? {extendRange: true} : undefined);
}

function handleSelectLoopInner(loopStepId: string, innerStepId: string) {
  editorStore.selectLoopInnerStep(loopStepId, innerStepId);
}

function handleSelectInlineCapsuleInner(capsuleStepId: string, innerStepId: string) {
  editorStore.selectInlineCapsuleInnerStep(capsuleStepId, innerStepId);
}

function handleBuildFromDescription() {
  moreMenuOpen.value = false;
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

function openManualImportFromGenerator() {
  generatorModalOpen.value = false;
  importModalOpen.value = true;
}

function handleWrapInRetryLoop() {
  moreMenuOpen.value = false;
  const range = editorStore.getSelectionRange();
  if (!range) {
    inlineError.value = 'Select steps to wrap. Shift+click to select a range ending with a verification step.';
    return;
  }
  const stepCount = range.endIndex - range.startIndex + 1;
  const result = editorStore.wrapSelectionInRetryLoop(
    stepCount === 2 ? `Retry: ${editorStore.steps[range.endIndex]?.label ?? 'loop'}` : undefined,
  );
  if (!result.ok) {
    inlineError.value = result.message;
    return;
  }
  inlineError.value = null;
  uiStore.setRightPaneTab('inspector');
}

async function handleLockSelectionAsCapsule() {
  moreMenuOpen.value = false;
  if (editorStore.steps.length === 0) {
    inlineError.value = 'Add steps before locking a Capsule.';
    return;
  }
  const range = editorStore.getSelectionRange();
  const stepCount = range ? range.endIndex - range.startIndex + 1 : editorStore.steps.length;
  const confirmed = await showConfirm({
    title: 'Lock as Capsule',
    message: range
      ? `Replace ${stepCount} selected step(s) with a locked Capsule instance?`
      : `Replace all ${stepCount} pipeline step(s) with a locked Capsule instance?`,
    confirmLabel: 'Lock',
    destructive: true,
  });
  if (!confirmed) return;
  const defaultName = range ? editorStore.selectedStep?.label ?? 'Pipeline Capsule' : editorStore.pipeline.name || 'Pipeline Capsule';
  const name = await showPrompt({title: 'Name this Capsule', label: 'Capsule name', defaultValue: defaultName});
  if (!name) return;
  const result = editorStore.lockSelectionAsCapsule(name);
  if (!result.ok) {
    inlineError.value = result.message;
    return;
  }
  capsulesStore.addCapsule(result.capsule);
  await pipelinesStore.save(editorStore.pipeline);
  inlineError.value = null;
  uiStore.setRightPaneTab('inspector');
}

function handleSpreadCapsule(stepId: string) {
  const result = editorStore.spreadCapsule(stepId);
  if (!result.ok) {
    inlineError.value = result.message;
    return;
  }
  inlineError.value = null;
  uiStore.setRightPaneTab('inspector');
}

async function handleLockInlineCapsule(stepId: string) {
  const step = editorStore.steps.find((s) => s.id === stepId);
  const defaultName = step?.label ?? 'Inline Capsule';
  const name = await showPrompt({title: 'Name this Capsule', label: 'Capsule name', defaultValue: defaultName});
  if (!name) return;
  const confirmed = await showConfirm({
    title: 'Lock inline Capsule',
    message: 'Save these inline steps as a locked Capsule and point this instance at it?',
    confirmLabel: 'Lock',
  });
  if (!confirmed) return;
  const result = editorStore.lockInlineCapsuleAsCapsule(stepId, name);
  if (!result.ok) {
    inlineError.value = result.message;
    return;
  }
  capsulesStore.addCapsule(result.capsule);
  await pipelinesStore.save(editorStore.pipeline);
  inlineError.value = null;
}

async function handleDetachCapsule(stepId: string) {
  const confirmed = await showConfirm({
    title: 'Detach Capsule',
    message: 'Replace this Capsule instance with its inline steps and break the link?',
    confirmLabel: 'Detach',
    destructive: true,
  });
  if (!confirmed) return;
  const result = editorStore.detachCapsule(stepId);
  if (!result.ok) {
    inlineError.value = result.message;
    return;
  }
  await pipelinesStore.save(editorStore.pipeline);
  inlineError.value = null;
}

function commitPipelineName() {
  const name = localPipelineName.value.trim() || 'Untitled';
  if (name !== editorStore.pipeline.name) {
    editorStore.updatePipelineName(name);
  }
}

function withDefaultModel(step: import('@lorca/core').PipelineStep) {
  return autoAssignModelToStep(step, modelsStore.models, step.type === 'model-call' ? 'general' : undefined);
}

function handleAppend(type: StepType) {
  const step = withDefaultModel(editorStore.buildDefaultStep(type));
  const id = editorStore.appendStep(step);
  editorStore.selectStep(id);
}

function handleInsertAfter(anchorStepId: string) {
  const anchor = editorStore.steps.find((s) => s.id === anchorStepId);
  const type: StepType = anchor?.type ?? 'model-call';
  const step = withDefaultModel(editorStore.buildDefaultStep(type));
  const id = editorStore.insertStepAfter(anchorStepId, step);
  editorStore.selectStep(id);
}

function handleInsertAt(index: number) {
  const step = withDefaultModel(editorStore.buildDefaultStep('model-call'));
  if (index === 0 && editorStore.steps.length > 0) {
    editorStore.insertStepBefore(editorStore.steps[0]!.id, step);
  } else {
    editorStore.appendStep(step);
  }
  editorStore.selectStep(step.id);
}

function handleMoveUp(stepId: string) {
  const idx = editorStore.steps.findIndex((s) => s.id === stepId);
  if (idx > 0) editorStore.moveStep(stepId, idx - 1);
}

function handleMoveDown(stepId: string) {
  const idx = editorStore.steps.findIndex((s) => s.id === stepId);
  if (idx < editorStore.steps.length - 1) editorStore.moveStep(stepId, idx + 1);
}

function handleReorder(stepId: string, targetIndex: number) {
  const fromIdx = editorStore.steps.findIndex((s) => s.id === stepId);
  if (fromIdx < 0 || fromIdx === targetIndex) return;
  editorStore.moveStep(stepId, targetIndex);
}

function handleDropSuggestion(suggestionId: string, insertIndex: number) {
  suggestionInsert.insertSuggestionById(suggestionId, 'at-index', insertIndex);
}

watch(
  () => runStore.trace.length,
  () => {
    if (!followRunLive.value || !runStore.isRunning) return;
    const last = runStore.trace.at(-1);
    if (!last) return;
    const stepId = last.stepId ?? last.nodeId;
    if (!stepId) return;
    if (last.status === 'started' || last.status === 'completed') {
      editorStore.selectStep(stepId);
    }
  },
);

function handleDuplicate(stepId: string) {
  const newId = editorStore.duplicateStep(stepId);
  if (newId) editorStore.selectStep(newId);
}

function handleToggleEnabled(stepId: string) {
  const step = editorStore.steps.find((s) => s.id === stepId);
  if (step) editorStore.setStepEnabled(stepId, !step.enabled);
}

function handleUpdateStepComment(stepId: string, comment: string) {
  editorStore.updateStepConfig(stepId, {description: comment});
}

function onUserPromptInput(raw: string) {
  userPrompt.value = raw;
  editorStore.updateUserPromptDuringEdit(raw);
}

async function handleRun() {
  editorStore.updateUserPrompt(userPrompt.value);
  await runStore.run(editorStore.pipeline, userPrompt.value);
}

async function handleRunUpTo(stepId: string) {
  editorStore.updateUserPrompt(userPrompt.value);
  await runStore.run(editorStore.pipeline, userPrompt.value, stepId);
}

function resolveCapsuleInnerStartAtStepId(capsuleStepId: string): string | undefined {
  const step = editorStore.steps.find((s) => s.id === capsuleStepId);
  if (step?.config.type !== 'capsule-instance' || step.config.displayMode !== 'inline') return undefined;
  const innerStepId = editorStore.selectedInlineCapsuleInnerStepId;
  if (!innerStepId) return undefined;
  if (!(step.config.inlineSteps ?? []).some((s) => s.id === innerStepId)) return undefined;
  return innerStepId;
}

async function handleRunFromStep(stepId: string) {
  editorStore.updateUserPrompt(userPrompt.value);
  await runStore.runFromStep(
    editorStore.pipeline,
    userPrompt.value,
    stepId,
    resolveCapsuleInnerStartAtStepId(stepId),
  );
}

async function handleRunOnlyStep(stepId: string) {
  editorStore.updateUserPrompt(userPrompt.value);
  await runStore.runOnlyStep(
    editorStore.pipeline,
    userPrompt.value,
    stepId,
    resolveCapsuleInnerStartAtStepId(stepId),
  );
}

function handleExport() {
  moreMenuOpen.value = false;
  editorStore.updateUserPrompt(userPrompt.value);
  refreshExportModal(false);
}

function refreshExportModal(includeStepOutputs: boolean) {
  const {json, filename} = importStore.buildPipelineExportJson(
    editorStore.pipeline,
    includeStepOutputs ? currentStepOutputs() : null,
  );
  exportModal.value = {open: true, json, filename, includeStepOutputs};
}

function setExportStepOutputs(includeStepOutputs: boolean) {
  refreshExportModal(includeStepOutputs);
}

function currentStepOutputs(): StepOutputsExport | null {
  if (!hasStepOutputs.value || runStore.status === 'idle' || runStore.status === 'running') return null;
  return {
    status: runStore.status,
    runId: runStore.runId,
    artifacts: runStore.artifacts,
    trace: runStore.trace,
    finalOutputKey: runStore.finalOutputKey,
    error: runStore.error,
    snapshots: runStore.snapshots,
    userPromptSignature: runStore.userPromptSignature,
    partial: runStore.partial,
    executedStepIds: runStore.executedStepIds,
    rerunSingleStepId: runStore.rerunSingleStepId,
  };
}

function handleImport() {
  moreMenuOpen.value = false;
  importModalOpen.value = true;
}

function handleImportSubmit(text: string, includeStepOutputs: boolean) {
  importModalOpen.value = false;
  try {
    const data = importStore.parseImportJson(text);
    importStore.beginPipelineImport(data, includeStepOutputs);
  } catch {
    importStore.setImportErrors(['Import file is not valid JSON']);
  }
}

async function handleNew() {
  const confirmed = await showConfirm({
    title: 'New Pipeline',
    message: 'Start a new pipeline?\n\nYour current pipeline and run results will be cleared.',
    confirmLabel: 'New Pipeline',
    destructive: true,
  });
  if (!confirmed) return;
  if (runStore.isRunning) runStore.cancel();
  runStore.reset();
  const prevId = pipelinesStore.activePipelineId;
  try {
    await pipelinesStore.addNewPipeline();
    if (prevId) pipelinesStore.removePipeline(prevId);
    userPrompt.value = '';
    localPipelineName.value = 'New Pipeline';
    emit('new');
  } catch (error) {
    inlineError.value = error instanceof Error ? error.message : 'Could not create a new pipeline.';
  }
}

function handlePipelineSelect(id: string) {
  if (runStore.isRunning) runStore.cancel();
  runStore.reset();
  pipelinesStore.setActive(id);
}

async function handlePipelineDelete(id: string) {
  pipelinesStore.removePipeline(id);
  if (!pipelinesStore.activePipeline) {
    const first = pipelinesStore.pipelines[0];
    if (first) {
      pipelinesStore.setActive(first.id);
    } else {
      await pipelinesStore.addNewPipeline();
    }
  }
  if (runStore.isRunning) runStore.cancel();
  runStore.reset();
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
</script>

<style scoped>
.center-pane { display: flex; flex-direction: column; height: 100%; overflow: hidden; container-type: inline-size; }

.center-toolbar {
  display: flex; align-items: center; gap: 0.55rem; flex-wrap: wrap;
  padding: 0.65rem 1rem; border-bottom: 1px solid var(--border-divider); flex-shrink: 0;
}
.pipeline-name {
  flex: 1; background: transparent; border: none; color: #e8e8e8;
  font-size: 1rem; font-weight: 500; min-width: 0;
}
.pipeline-name:focus { outline: none; border-bottom: 1px solid #3a6080; }

.run-controls {
  display: flex; flex: 1 1 auto; gap: 0.4rem; align-items: center;
  justify-content: flex-end; flex-wrap: wrap; min-width: 0;
}
.pipeline-action-controls,
.execute-controls {
  display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap;
}
.execute-controls { flex-shrink: 0; }
.btn { border-radius: 5px; padding: 6px 14px; font-size: 0.85rem; cursor: pointer; border: 1px solid #333; }
.btn-run { background: #1e3d52; border-color: #2a5070; color: #7ec8e3; }
.btn-run:hover:not(:disabled) { background: #254a62; }
.btn-run:disabled { opacity: 0.4; cursor: default; }
.btn-secondary { background: #1a1a1a; color: #aaa; }
.btn-secondary:hover { background: #222; color: #ccc; }
.btn-cancel { background: #2d1a1a; border-color: #4d2222; color: #e07070; }
.btn-cancel:hover { background: #3d2222; }
.follow-run-label {
  display: flex; align-items: center; gap: 0.35rem; font-size: 0.82rem;
  color: var(--text-label); cursor: pointer; user-select: none; flex-shrink: 0;
}
.follow-run-label input { cursor: pointer; }

/* More menu */
.more-menu-wrap { position: relative; }
.ovf-inline { display: none; }

@container (min-width: 640px) {
  .ovf-1 { display: inline-flex; }
  .ovf-drop-1 { display: none; }
}
@container (min-width: 760px) {
  .ovf-2 { display: inline-flex; }
  .ovf-drop-2 { display: none; }
}
@container (min-width: 875px) {
  .ovf-3 { display: inline-flex; }
  .ovf-drop-3 { display: none; }
}
@container (min-width: 945px) {
  .ovf-4 { display: inline-flex; }
  .ovf-drop-4 { display: none; }
}
@container (min-width: 1010px) {
  .ovf-5 { display: inline-flex; }
  .ovf-drop-5 { display: none; }
  .more-menu-wrap { display: none; }
}

/* Running adds Follow + Cancel — keep inline actions in the More menu longer */
@container (min-width: 640px) and (max-width: 819px) {
  .run-controls.is-running .ovf-1 { display: none; }
  .run-controls.is-running .ovf-drop-1 { display: block; }
}
@container (min-width: 760px) and (max-width: 939px) {
  .run-controls.is-running .ovf-2 { display: none; }
  .run-controls.is-running .ovf-drop-2 { display: block; }
}
@container (min-width: 875px) and (max-width: 1054px) {
  .run-controls.is-running .ovf-3 { display: none; }
  .run-controls.is-running .ovf-drop-3 { display: block; }
}
@container (min-width: 945px) and (max-width: 1124px) {
  .run-controls.is-running .ovf-4 { display: none; }
  .run-controls.is-running .ovf-drop-4 { display: block; }
}
@container (min-width: 1010px) and (max-width: 1189px) {
  .run-controls.is-running .ovf-5 { display: none; }
  .run-controls.is-running .ovf-drop-5 { display: block; }
  .run-controls.is-running .more-menu-wrap { display: block; }
}

@container (max-width: 720px) {
  .follow-run-text { display: none; }
}
.more-menu-dropdown {
  position: absolute; top: calc(100% + 4px); left: 0; z-index: 200;
  background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 5px;
  display: flex; flex-direction: column; min-width: 190px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.4);
}
.more-menu-item {
  background: none; border: none; color: #aaa; text-align: left;
  padding: 9px 16px; font-size: 0.85rem; cursor: pointer;
}
.more-menu-item:hover { background: #242424; color: #ccc; }

/* Inline error */
.inline-error-banner {
  display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;
  background: #1a0f0f; border-bottom: 1px solid #4d2222;
  color: #e07070; font-size: 0.82rem; padding: 0.4rem 1rem; flex-shrink: 0;
}
.inline-error-close {
  background: none; border: none; color: #e07070; cursor: pointer; font-size: 1.1rem; padding: 0;
}
.inline-error-close:hover { color: #ff9090; }

.user-prompt-bar {
  display: flex; align-items: flex-start; gap: 0.6rem;
  padding: 0.65rem 1rem; border-bottom: 1px solid var(--border-divider); flex-shrink: 0;
}
.prompt-label { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-secondary); padding-top: 0.35rem; flex-shrink: 0; }
.user-prompt-input {
  flex: 1; background: #111; border: 1px solid #2a2a2a; border-radius: 5px;
  color: #ccc; font-size: 0.9rem; padding: 0.5rem 0.65rem; resize: vertical;
  font-family: inherit; line-height: 1.4;
}
.user-prompt-input:focus { outline: none; border-color: #2a5070; }

@media (max-width: 767px) {
  .center-toolbar { padding: 0.55rem 0.75rem; gap: 0.4rem; }
  .run-controls { flex-wrap: wrap; }
}

@container (max-width: 620px) {
  .center-toolbar {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    padding: 0.55rem 0.7rem;
  }

  .run-controls {
    grid-column: 1 / -1;
    flex-wrap: wrap;
  }

  .btn {
    padding-inline: 10px;
  }

  .user-prompt-bar {
    padding: 0.55rem 0.7rem;
  }
}

@container (max-width: 430px) {
  .prompt-label {
    display: none;
  }
}
</style>
