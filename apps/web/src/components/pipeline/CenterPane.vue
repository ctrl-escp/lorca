<template>
  <div class="center-pane">
    <div class="center-toolbar">
      <button class="btn btn-secondary btn-new" type="button" title="Start a new empty pipeline" @click="handleNew">New</button>
      <input
        class="pipeline-name"
        v-model="localPipelineName"
        placeholder="Pipeline name"
        @blur="commitPipelineName"
        @keydown.enter="commitPipelineName"
      />
      <div class="run-controls">
        <button class="btn btn-secondary" type="button" title="Save selected steps as a draft Capsule (Shift+click to select a range)" @click="handleExtractSelection">Extract to Capsule</button>
        <button class="btn btn-secondary" type="button" title="Replace all steps with one Capsule instance" @click="handleConvertPipeline">Convert to Capsule</button>
        <button class="btn btn-secondary" type="button" @click="handleExport">Export</button>
        <button class="btn btn-secondary" type="button" @click="handleImport">Import</button>
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

    <!-- User prompt input -->
    <div class="user-prompt-bar">
      <label class="prompt-label">Prompt</label>
      <textarea
        class="user-prompt-input"
        v-model="userPrompt"
        placeholder="Enter your prompt…"
        rows="2"
        @blur="editorStore.updateUserPrompt(userPrompt)"
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
      @select="handleSelectStep"
      @append="handleAppend"
      @insert-after="handleInsertAfter"
      @insert-at="handleInsertAt"
      @move-up="handleMoveUp"
      @move-down="handleMoveDown"
      @duplicate="handleDuplicate"
      @toggle-enabled="handleToggleEnabled"
      @delete="editorStore.deleteStep"
      @run-up-to="handleRunUpTo"
      @undo="editorStore.undo"
      @redo="editorStore.redo"
    />
  </div>
</template>

<script setup lang="ts">
import {ref, computed, watch, onMounted, onUnmounted} from 'vue';
import type {PipelineDefinition, StepType} from '@lorca/core';
import {computeStepStaleStates} from '@lorca/pipeline';
import type {StepStaleState} from '@lorca/pipeline';
import {usePipelineEditorStore} from '../../stores/pipelineEditor.js';
import {useActiveRunStore} from '../../stores/activeRun.js';
import {useImportExportStore} from '../../stores/importExport.js';
import {usePipelinesStore} from '../../stores/pipelines.js';
import {useCapsulesStore} from '../../stores/capsules.js';
import {useUiStore} from '../../stores/ui.js';
import {pickJsonFile} from '../../utils/importFile.js';
import {pipelineStepChainRunReady} from '../../utils/pipelineRunReady.js';
import ChainEditor from './ChainEditor.vue';

const props = defineProps<{def: PipelineDefinition}>();
const emit = defineEmits<{update: [def: PipelineDefinition]; new: []}>();

const runStore = useActiveRunStore();
const pipelinesStore = usePipelinesStore();
const capsulesStore = useCapsulesStore();
const uiStore = useUiStore();
const importStore = useImportExportStore();
const editorStore = usePipelineEditorStore();

const userPrompt = ref(props.def.input.raw);
const localPipelineName = ref(props.def.name);

onMounted(() => {
  editorStore.loadPipeline(props.def);
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
  }
};

onMounted(() => window.addEventListener('keydown', onKeyDown));
onUnmounted(() => window.removeEventListener('keydown', onKeyDown));

watch(() => props.def, (def) => {
  editorStore.loadPipeline(def);
  userPrompt.value = def.input.raw;
  localPipelineName.value = def.name;
});

watch(editorStore.pipeline, (newDef) => {
  emit('update', newDef);
}, {deep: true});

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
  if (canRun.value) return 'Run the entire pipeline with the current prompt';
  const needs: string[] = [];
  if (!userPrompt.value.trim()) needs.push('enter a prompt');
  const hasModel = editorStore.steps.some((s) => s.enabled && s.type === 'model-call');
  if (!hasModel) needs.push('add a model call step');
  return needs.length ? `To run: ${needs.join(' and ')}` : 'Configure pipeline to run';
});

const resolveCapsule = (id: string, version: string) => capsulesStore.getCapsule(id, version);

const stepStates = computed(() => {
  const states = computeStepStaleStates(
    editorStore.pipeline,
    runStore.runSnapshotContext,
    userPrompt.value,
    resolveCapsule,
  );
  return Object.fromEntries(states.map((s) => [s.stepId, s])) as Record<string, StepStaleState>;
});

const selectionRange = computed(() => {
  const range = editorStore.getSelectionRange();
  if (!range) return null;
  const ids = editorStore.steps.slice(range.startIndex, range.endIndex + 1).map((s) => s.id);
  return {startIndex: range.startIndex, endIndex: range.endIndex, stepIds: ids};
});

function handleSelectStep(stepId: string, extendRange?: boolean) {
  editorStore.selectStep(stepId, extendRange ? {extendRange: true} : undefined);
}

function promptCapsuleName(defaultName: string): string | null {
  const name = window.prompt('Capsule name', defaultName);
  if (!name?.trim()) return null;
  return name.trim();
}

function handleExtractSelection() {
  const range = editorStore.getSelectionRange();
  if (!range) {
    window.alert('Select steps to extract. Shift+click another step to define a range.');
    return;
  }
  const stepCount = range.endIndex - range.startIndex + 1;
  if (!window.confirm(
    `Replace ${stepCount} selected step(s) with a single Capsule instance?\n\nThe original steps will be saved as a new Capsule definition.`,
  )) return;
  const defaultName = editorStore.selectedStep?.label ?? 'Extracted Capsule';
  const name = promptCapsuleName(defaultName);
  if (!name) return;
  const result = editorStore.extractSelectionToCapsule(name);
  if (!result.ok) {
    window.alert(result.message);
    return;
  }
  capsulesStore.addCapsule(result.capsule);
  uiStore.openCapsuleEditor(result.capsule.id);
}

function handleConvertPipeline() {
  if (editorStore.steps.length === 0) {
    window.alert('Add steps before converting the pipeline to a Capsule.');
    return;
  }
  const name = promptCapsuleName(editorStore.pipeline.name || 'Pipeline Capsule');
  if (!name) return;
  if (!window.confirm(`Replace all ${editorStore.steps.length} step(s) with a single Capsule instance?`)) return;
  const result = editorStore.convertPipelineToCapsule(name);
  if (!result.ok) {
    window.alert(result.message);
    return;
  }
  capsulesStore.addCapsule(result.capsule);
  uiStore.openCapsuleEditor(result.capsule.id);
}

function commitPipelineName() {
  const name = localPipelineName.value.trim() || 'Untitled';
  if (name !== editorStore.pipeline.name) {
    editorStore.updatePipelineName(name);
  }
}

function handleAppend(type: StepType) {
  const step = editorStore.buildDefaultStep(type);
  const id = editorStore.appendStep(step);
  editorStore.selectStep(id);
}

function handleInsertAfter(anchorStepId: string) {
  const anchor = editorStore.steps.find((s) => s.id === anchorStepId);
  const type: StepType = anchor?.type ?? 'model-call';
  const step = editorStore.buildDefaultStep(type);
  const id = editorStore.insertStepAfter(anchorStepId, step);
  editorStore.selectStep(id);
}

function handleInsertAt(index: number) {
  const step = editorStore.buildDefaultStep('model-call');
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

function handleExport() {
  importStore.exportCurrentPipeline(editorStore.pipeline);
}

function handleImport() {
  pickJsonFile((text) => {
    try {
      const data = importStore.parseImportJson(text);
      importStore.beginPipelineImport(data);
    } catch {
      importStore.setImportErrors(['Import file is not valid JSON']);
    }
  });
}

async function handleNew() {
  const confirmed = window.confirm(
    'Start a new pipeline?\n\nYour current pipeline and run results will be cleared.',
  );
  if (!confirmed) return;
  if (runStore.isRunning) runStore.cancel();
  runStore.reset();
  await pipelinesStore.resetActivePipeline();
  userPrompt.value = '';
  localPipelineName.value = 'New Pipeline';
  emit('new');
}
</script>

<style scoped>
.center-pane { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

.center-toolbar {
  display: flex; align-items: center; gap: 0.75rem;
  padding: 0.45rem 0.75rem; border-bottom: 1px solid #1e1e1e; flex-shrink: 0;
}
.pipeline-name {
  flex: 1; background: transparent; border: none; color: #e8e8e8;
  font-size: 0.88rem; font-weight: 500;
}
.pipeline-name:focus { outline: none; border-bottom: 1px solid #3a6080; }

.run-controls { display: flex; gap: 0.35rem; }
.btn { border-radius: 4px; padding: 4px 12px; font-size: 0.8rem; cursor: pointer; border: 1px solid #333; }
.btn-run { background: #1e3d52; border-color: #2a5070; color: #7ec8e3; }
.btn-run:hover:not(:disabled) { background: #254a62; }
.btn-run:disabled { opacity: 0.4; cursor: default; }
.btn-secondary { background: #1a1a1a; color: #aaa; }
.btn-secondary:hover { background: #222; color: #ccc; }
.btn-cancel { background: #2d1a1a; border-color: #4d2222; color: #e07070; }
.btn-cancel:hover { background: #3d2222; }

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
