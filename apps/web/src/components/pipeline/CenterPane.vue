<template>
  <div class="center-pane">
    <PipelineToolbar
      :pipelines="pipelinesStore.pipelines"
      :active-pipeline-id="pipelinesStore.activePipelineId"
      v-model:pipeline-name="localPipelineName"
      v-model:follow-run-live="followRunLive"
      :is-running="runStore.isRunning"
      :can-run="canRun"
      :run-button-title="runButtonTitle"
      @new="handleNew"
      @pipeline-select="handlePipelineSelect"
      @pipeline-delete="handlePipelineDelete"
      @clear-all-pipelines="handleClearAllPipelines"
      @reset-workspace="handleResetWorkspace"
      @commit-pipeline-name="commitPipelineName"
      @build-from-description="openGeneratorModal()"
      @wrap-retry-loop="handleWrapInRetryLoop"
      @lock-as-capsule="handleLockSelectionAsCapsule"
      @export="handleExport"
      @import="handleImport"
      @run="handleRun"
      @cancel="runStore.cancel()"
    />

    <!-- Inline error banner for extraction/conversion failures -->
    <div v-if="inlineError" class="inline-error-banner">
      {{ inlineError }}
      <button type="button" class="inline-error-close" @click="inlineError = null">×</button>
    </div>

    <!-- User prompt input -->
    <div class="user-prompt-bar">
      <label class="prompt-label hdr-prompt">Prompt</label>
      <TextEditor
        class="user-prompt-input"
        :model-value="userPrompt"
        placeholder="Enter your prompt…"
        :rows="2"
        @focus="editorStore.beginInputEdit()"
        @update:model-value="onUserPromptInput"
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
      @close="closeGeneratorModal()"
      @generate="handleGeneratePipeline"
      @apply="openGeneratedModelRemap()"
      @manual-import="openManualImportFromGenerator(() => { importModalOpen = true; })"
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
import type {PipelineDefinition, StepOutputsExport, StepType} from '@lorca/core';
import {useStepStaleStateMap} from '../../composables/useStepStaleStateMap.js';
import {usePipelineEditorStore} from '../../stores/pipelineEditor.js';
import {useActiveRunStore} from '../../stores/activeRun.js';
import {useImportExportStore} from '../../stores/importExport.js';
import {usePipelinesStore} from '../../stores/pipelines.js';
import {useCapsulesStore} from '../../stores/capsules.js';
import {useModelsStore} from '../../stores/models.js';
import {useEndpointsStore} from '../../stores/endpoints.js';
import {pipelineHasConfiguredModel, pipelineStepChainRunReady} from '../../utils/pipelineRunReady.js';
import {autoAssignModelToStep} from '@lorca/endpoints';
import {useSuggestionInsert} from '../../composables/useSuggestionInsert.js';
import {usePipelineGeneratorFlow} from '../../composables/usePipelineGeneratorFlow.js';
import {usePipelineCapsuleActions} from '../../composables/usePipelineCapsuleActions.js';
import {useModalDialogs} from '../../composables/useModalDialogs.js';
import {resetWorkspace} from '../../utils/workspaceReset.js';
import {useCapsuleRunStore} from '../../stores/capsuleRun.js';
import {useUiStore} from '../../stores/ui.js';
import ChainEditor from './ChainEditor.vue';
import PipelineToolbar from './PipelineToolbar.vue';
import {ConfirmDialog, PromptDialog} from '@lorca/ui-kit';
import ExportModal from '../export/ExportModal.vue';
import ImportModal from '../import/ImportModal.vue';
import ImportRemapDialog from '../import/ImportRemapDialog.vue';
import PipelineGeneratorModal from './PipelineGeneratorModal.vue';
import TextEditor from '../shared/TextEditor.vue';

const props = defineProps<{def: PipelineDefinition}>();
const emit = defineEmits<{update: [def: PipelineDefinition]; new: []}>();

const runStore = useActiveRunStore();
const capsuleRunStore = useCapsuleRunStore();
const uiStore = useUiStore();
const pipelinesStore = usePipelinesStore();
const capsulesStore = useCapsulesStore();
const importStore = useImportExportStore();
const editorStore = usePipelineEditorStore();
const modelsStore = useModelsStore();
const endpointsStore = useEndpointsStore();
const suggestionInsert = useSuggestionInsert();
const followRunLive = ref(true);
const inlineError = ref<string | null>(null);

const exportModal = ref<{open: boolean; json: string; filename: string; includeStepOutputs: boolean}>({
  open: false,
  json: '',
  filename: '',
  includeStepOutputs: false,
});
const importModalOpen = ref(false);
const {
  generatorModalOpen,
  generatorLoading,
  generatorError,
  generatorRawResponse,
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
} = usePipelineGeneratorFlow();

const userPrompt = ref(props.def.input.raw);
const localPipelineName = ref(props.def.name);
const hasStepOutputs = computed(() => Object.keys(runStore.artifacts).length > 0);

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
const {
  confirmState,
  promptState,
  showConfirm,
  resolveConfirm,
  showPrompt,
  resolvePrompt,
} = useModalDialogs();

const {
  handleWrapInRetryLoop,
  handleLockSelectionAsCapsule,
  handleSpreadCapsule,
  handleLockInlineCapsule,
  handleDetachCapsule,
} = usePipelineCapsuleActions({
  inlineError,
  closeMoreMenu: () => {},
  modals: {showConfirm, showPrompt},
});

// ── Lifecycle ────────────────────────────────────────────────────────────────

onMounted(() => {
  editorStore.loadPipeline(props.def);
  runStore.restoreForPipeline(props.def.id);
  window.addEventListener('keydown', onKeyDown);
});

onUnmounted(() => {
  abortGeneratorOnUnmount();
  window.removeEventListener('keydown', onKeyDown);
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

async function handleClearAllPipelines() {
  const confirmed = await showConfirm({
    title: 'Clear All Pipelines',
    message: 'Delete all saved pipelines? A fresh default pipeline will be created. This cannot be undone.',
    confirmLabel: 'Clear all',
    destructive: true,
  });
  if (!confirmed) return;
  if (runStore.isRunning) runStore.cancel();
  runStore.reset();
  try {
    await pipelinesStore.clearAllPipelines();
    userPrompt.value = '';
    localPipelineName.value = 'New Pipeline';
    emit('new');
  } catch (error) {
    inlineError.value = error instanceof Error ? error.message : 'Could not clear pipelines.';
  }
}

async function handleResetWorkspace() {
  const confirmed = await showConfirm({
    title: 'Reset Workspace',
    message:
      'Delete all pipelines, user capsules, endpoints, discovered models, and saved run history?\n\n' +
      'A fresh default pipeline and disabled Local Ollama endpoint will be created. Built-in example capsules are kept. This cannot be undone.',
    confirmLabel: 'Reset everything',
    destructive: true,
  });
  if (!confirmed) return;
  if (runStore.isRunning) runStore.cancel();
  runStore.reset();
  capsuleRunStore.reset();
  importStore.cancelImport();
  uiStore.closeCapsuleEditor();
  try {
    await resetWorkspace();
    userPrompt.value = '';
    localPipelineName.value = 'New Pipeline';
    emit('new');
  } catch (error) {
    inlineError.value = error instanceof Error ? error.message : 'Could not reset workspace.';
  }
}

</script>

<style scoped>
.center-pane { display: flex; flex-direction: column; height: 100%; overflow: hidden; container-type: inline-size; }

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
.prompt-label { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.06em; padding-top: 0.35rem; flex-shrink: 0; font-weight: 600; }
.user-prompt-input {
  flex: 1;
}
.user-prompt-input :deep(.cm-editor) { font-size: 0.9rem; }
.user-prompt-input :deep(.cm-content) { font-family: inherit; }

@container (max-width: 620px) {
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
