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
      <div class="run-controls">
        <!-- More dropdown -->
        <div class="more-menu-wrap" ref="moreMenuRef">
          <button class="btn btn-secondary" type="button" @click="moreMenuOpen = !moreMenuOpen">⋯ More</button>
          <div v-if="moreMenuOpen" class="more-menu-dropdown">
            <button class="more-menu-item" type="button" title="Save selected steps as a draft Capsule" @click="handleExtractSelection">Extract to Capsule</button>
            <button class="more-menu-item" type="button" title="Replace all steps with one Capsule instance" @click="handleConvertPipeline">Convert to Capsule</button>
            <button class="more-menu-item" type="button" @click="handleExport">Export</button>
            <button class="more-menu-item" type="button" @click="handleImport">Import</button>
          </div>
        </div>
        <label v-if="runStore.isRunning" class="follow-run-label" title="Auto-scroll step selection to the running step">
          <input type="checkbox" v-model="followRunLive" />
          Follow
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
        @blur="editorStore.commitUserPrompt(userPrompt)"
      />
    </div>

    <ChainEditor
      :steps="editorStore.steps"
      :selected-step-id="editorStore.selectedStepId"
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
      :accept-suggestion-drop="true"
      @select="handleSelectStep"
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
      @run-only-step="handleRunOnlyStep"
      @undo="editorStore.undo"
      @redo="editorStore.redo"
    />

    <!-- Dialogs -->
    <ExportModal
      :open="exportModal.open"
      title="Export Pipeline"
      :json="exportModal.json"
      :filename="exportModal.filename"
      @close="exportModal.open = false"
    />
    <ImportModal
      :open="importModalOpen"
      kind="pipeline"
      @close="importModalOpen = false"
      @submit="handleImportSubmit"
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
import type {PipelineDefinition, StepType} from '@lorca/core';
import {useStepStaleStateMap} from '../../composables/useStepStaleStateMap.js';
import {usePipelineEditorStore} from '../../stores/pipelineEditor.js';
import {useActiveRunStore} from '../../stores/activeRun.js';
import {useImportExportStore} from '../../stores/importExport.js';
import {usePipelinesStore} from '../../stores/pipelines.js';
import {useCapsulesStore} from '../../stores/capsules.js';
import {useUiStore} from '../../stores/ui.js';
import {useModelsStore} from '../../stores/models.js';
import {pipelineStepChainRunReady} from '../../utils/pipelineRunReady.js';
import {autoAssignModelToStep} from '@lorca/endpoints';
import {useSuggestionInsert} from '../../composables/useSuggestionInsert.js';
import ChainEditor from './ChainEditor.vue';
import PipelineSelector from './PipelineSelector.vue';
import {ConfirmDialog, PromptDialog} from '@lorca/ui-kit';
import ExportModal from '../export/ExportModal.vue';
import ImportModal from '../import/ImportModal.vue';

const props = defineProps<{def: PipelineDefinition}>();
const emit = defineEmits<{update: [def: PipelineDefinition]; new: []}>();

const runStore = useActiveRunStore();
const pipelinesStore = usePipelinesStore();
const capsulesStore = useCapsulesStore();
const uiStore = useUiStore();
const importStore = useImportExportStore();
const editorStore = usePipelineEditorStore();
const modelsStore = useModelsStore();
const suggestionInsert = useSuggestionInsert();
const followRunLive = ref(true);
const inlineError = ref<string | null>(null);

const exportModal = ref<{open: boolean; json: string; filename: string}>({open: false, json: '', filename: ''});
const importModalOpen = ref(false);

const userPrompt = ref(props.def.input.raw);
const localPipelineName = ref(props.def.name);

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
  window.addEventListener('keydown', onKeyDown);
  document.addEventListener('click', onDocClick, true);
});

onUnmounted(() => {
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

const canRun = computed(() => pipelineStepChainRunReady(editorStore.pipeline, userPrompt.value));

const runButtonTitle = computed(() => {
  if (canRun.value) return 'Run the entire pipeline — ⌘↵';
  const needs: string[] = [];
  if (!userPrompt.value.trim()) needs.push('enter a prompt');
  const hasModel = editorStore.steps.some((s) => s.enabled && s.type === 'model-call');
  if (!hasModel) needs.push('add a model call step');
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

async function handleExtractSelection() {
  moreMenuOpen.value = false;
  const range = editorStore.getSelectionRange();
  if (!range) {
    inlineError.value = 'Select steps to extract. Shift+click another step to define a range.';
    return;
  }
  const stepCount = range.endIndex - range.startIndex + 1;
  const confirmed = await showConfirm({
    title: 'Extract to Capsule',
    message: `Replace ${stepCount} selected step(s) with a single Capsule instance?\n\nThe original steps will be saved as a new Capsule definition.`,
    confirmLabel: 'Extract',
    destructive: true,
  });
  if (!confirmed) return;
  const defaultName = editorStore.selectedStep?.label ?? 'Extracted Capsule';
  const name = await showPrompt({title: 'Name this Capsule', label: 'Capsule name', defaultValue: defaultName});
  if (!name) return;
  const result = editorStore.extractSelectionToCapsule(name);
  if (!result.ok) {
    inlineError.value = result.message;
    return;
  }
  capsulesStore.addCapsule(result.capsule);
  await pipelinesStore.save(editorStore.pipeline);
  uiStore.openCapsuleEditor(result.capsule.id);
}

async function handleConvertPipeline() {
  moreMenuOpen.value = false;
  if (editorStore.steps.length === 0) {
    inlineError.value = 'Add steps before converting the pipeline to a Capsule.';
    return;
  }
  const name = await showPrompt({
    title: 'Name this Capsule',
    label: 'Capsule name',
    defaultValue: editorStore.pipeline.name || 'Pipeline Capsule',
  });
  if (!name) return;
  const confirmed = await showConfirm({
    title: 'Convert to Capsule',
    message: `Replace all ${editorStore.steps.length} step(s) with a single Capsule instance?`,
    confirmLabel: 'Convert',
    destructive: true,
  });
  if (!confirmed) return;
  const result = editorStore.convertPipelineToCapsule(name);
  if (!result.ok) {
    inlineError.value = result.message;
    return;
  }
  capsulesStore.addCapsule(result.capsule);
  await pipelinesStore.save(editorStore.pipeline);
  uiStore.openCapsuleEditor(result.capsule.id);
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

async function handleRun() {
  editorStore.updateUserPrompt(userPrompt.value.trim());
  await runStore.run(editorStore.pipeline, userPrompt.value.trim());
}

async function handleRunUpTo(stepId: string) {
  editorStore.updateUserPrompt(userPrompt.value.trim());
  await runStore.run(editorStore.pipeline, userPrompt.value.trim(), stepId);
}

async function handleRunOnlyStep(stepId: string) {
  editorStore.updateUserPrompt(userPrompt.value.trim());
  await runStore.runOnlyStep(editorStore.pipeline, userPrompt.value.trim(), stepId);
}

function handleExport() {
  moreMenuOpen.value = false;
  editorStore.updateUserPrompt(userPrompt.value.trim());
  const {json, filename} = importStore.buildPipelineExportJson(editorStore.pipeline);
  exportModal.value = {open: true, json, filename};
}

function handleImport() {
  moreMenuOpen.value = false;
  importModalOpen.value = true;
}

function handleImportSubmit(text: string) {
  importModalOpen.value = false;
  try {
    const data = importStore.parseImportJson(text);
    importStore.beginPipelineImport(data);
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
  await pipelinesStore.addNewPipeline();
  userPrompt.value = '';
  localPipelineName.value = 'New Pipeline';
  emit('new');
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
</script>

<style scoped>
.center-pane { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

.center-toolbar {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.45rem 0.75rem; border-bottom: 1px solid #1e1e1e; flex-shrink: 0;
}
.pipeline-name {
  flex: 1; background: transparent; border: none; color: #e8e8e8;
  font-size: 0.88rem; font-weight: 500; min-width: 0;
}
.pipeline-name:focus { outline: none; border-bottom: 1px solid #3a6080; }

.run-controls { display: flex; gap: 0.35rem; align-items: center; flex-shrink: 0; }
.btn { border-radius: 4px; padding: 4px 12px; font-size: 0.8rem; cursor: pointer; border: 1px solid #333; }
.btn-run { background: #1e3d52; border-color: #2a5070; color: #7ec8e3; }
.btn-run:hover:not(:disabled) { background: #254a62; }
.btn-run:disabled { opacity: 0.4; cursor: default; }
.btn-secondary { background: #1a1a1a; color: #aaa; }
.btn-secondary:hover { background: #222; color: #ccc; }
.btn-cancel { background: #2d1a1a; border-color: #4d2222; color: #e07070; }
.btn-cancel:hover { background: #3d2222; }
.follow-run-label { display: flex; align-items: center; gap: 0.3rem; font-size: 0.72rem; color: #888; cursor: pointer; user-select: none; }
.follow-run-label input { cursor: pointer; }

/* More menu */
.more-menu-wrap { position: relative; }
.more-menu-dropdown {
  position: absolute; top: calc(100% + 4px); left: 0; z-index: 200;
  background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 4px;
  display: flex; flex-direction: column; min-width: 180px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.4);
}
.more-menu-item {
  background: none; border: none; color: #aaa; text-align: left;
  padding: 7px 14px; font-size: 0.8rem; cursor: pointer;
}
.more-menu-item:hover { background: #242424; color: #ccc; }

/* Inline error */
.inline-error-banner {
  display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;
  background: #1a0f0f; border-bottom: 1px solid #4d2222;
  color: #e07070; font-size: 0.78rem; padding: 0.3rem 0.75rem; flex-shrink: 0;
}
.inline-error-close {
  background: none; border: none; color: #e07070; cursor: pointer; font-size: 1rem; padding: 0;
}
.inline-error-close:hover { color: #ff9090; }

.user-prompt-bar {
  display: flex; align-items: flex-start; gap: 0.5rem;
  padding: 0.5rem 0.75rem; border-bottom: 1px solid #1e1e1e; flex-shrink: 0;
}
.prompt-label { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.06em; color: #555; padding-top: 0.3rem; flex-shrink: 0; }
.user-prompt-input {
  flex: 1; background: #111; border: 1px solid #2a2a2a; border-radius: 4px;
  color: #ccc; font-size: 0.82rem; padding: 0.35rem 0.5rem; resize: vertical;
  font-family: inherit; line-height: 1.4;
}
.user-prompt-input:focus { outline: none; border-color: #2a5070; }
</style>
