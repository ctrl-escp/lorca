<template>
  <div class="capsule-center">
    <div class="capsule-toolbar">
      <input
        class="capsule-name"
        v-model="localName"
        @blur="commitName"
        placeholder="Capsule name"
        :readonly="editor.isReadOnly"
        title="Display name for this Capsule"
      />
      <span class="capsule-version" title="Capsule version identifier">{{ def.version }}</span>
      <span class="capsule-status" :class="`status-${def.status}`" :title="`Capsule is ${def.status}`">{{ def.status }}</span>
      <button v-if="def.status === 'draft'" class="btn btn-lock" title="Lock this Capsule so it can be used in pipelines" @click="handleLock">Lock</button>
      <button v-else class="btn btn-edit" title="Create a new draft copy to edit a locked Capsule" @click="handleEditLocked">Edit (new draft)</button>
      <button class="btn btn-secondary" type="button" title="Export Capsule JSON" @click="handleExport">Export</button>
      <button class="btn btn-secondary" type="button" title="Import Capsule JSON" @click="handleImport">Import</button>
    </div>

    <div class="user-prompt-bar" v-if="!editor.isReadOnly">
      <label class="prompt-label">Test prompt</label>
      <textarea
        class="user-prompt-input"
        v-model="testPrompt"
        placeholder="Enter your prompt…"
        rows="2"
        @focus="editor.beginInputEdit()"
        @blur="editor.commitUserPrompt(testPrompt)"
      />
    </div>

    <ChainEditor
      class="capsule-chain"
      :steps="editor.steps"
      :selected-step-id="editor.selectedStepId"
      :trace="capsuleRunStore.trace"
      :step-states="stepStates"
      :run-partial="capsuleRunStore.partial"
      :final-artifact-key="finalArtifactKey"
      :show-capsule-add="false"
      :show-undo-redo="!editor.isReadOnly"
      :can-undo="editor.canUndo"
      :can-redo="editor.canRedo"
      :last-undo-label="editor.lastUndoLabel"
      :last-redo-label="editor.lastRedoLabel"
      :run-snapshots="capsuleRunStore.snapshots"
      @select="editor.selectStep"
      @append="handleAppend"
      @insert-after="handleInsertAfter"
      @insert-at="handleInsertAt"
      @move-up="handleMoveUp"
      @move-down="handleMoveDown"
      @duplicate="handleDuplicate"
      @toggle-enabled="handleToggleEnabled"
      @delete="editor.deleteStep"
      @run-up-to="handleRunUpTo"
      @undo="editor.undo"
      @redo="editor.redo"
    />

    <ExportModal
      :open="exportModal.open"
      title="Export Capsule"
      :json="exportModal.json"
      :filename="exportModal.filename"
      @close="exportModal.open = false"
    />

    <!-- Test run panel -->
    <div class="test-panel">
      <div class="test-panel-header">
        <span class="test-panel-title">Test Run</span>
        <div class="test-run-controls">
          <button class="btn btn-run" :disabled="capsuleRunStore.isRunning" title="Run this Capsule with the test inputs below" @click="handleTestRun">
            {{ capsuleRunStore.isRunning ? 'Running…' : 'Test' }}
          </button>
          <button class="btn btn-cancel" v-if="capsuleRunStore.isRunning" title="Stop the current test run" @click="capsuleRunStore.cancel">Cancel</button>
        </div>
      </div>

      <div class="test-fields">
        <template v-if="def.interface.inputs.length > 0">
          <div v-for="port in def.interface.inputs" :key="port.name" class="test-field">
            <FieldLabel :label="port.name" :required="port.required" :title="`Test value for input port '${port.name}' (${port.kind})`" />
            <span class="kind-badge">{{ port.kind }}</span>
            <textarea
              v-model="testInputValues[port.name]"
              rows="2"
              :placeholder="port.kind === 'json' ? '{}' : ''"
              :title="`Test value for input port '${port.name}' (${port.kind})`"
            />
          </div>
        </template>

        <template v-if="def.interface.parameters.length > 0">
          <div v-for="param in def.interface.parameters" :key="param.name" class="test-field">
            <label :title="`Test value for parameter '${param.name}' (${param.kind})`">param: {{ param.name }} <span class="kind-badge">{{ param.kind }}</span></label>
            <input v-model="testParamValues[param.name]" :placeholder="param.kind" :title="`Test value for parameter '${param.name}'`" />
          </div>
        </template>

        <template v-if="def.interface.modelSlots.length > 0">
          <div v-for="slot in def.interface.modelSlots" :key="slot.name" class="test-field">
            <FieldLabel :label="`slot: ${slot.name}`" :required="slot.required" :title="`Model to use for slot '${slot.name}' during test run`" />
            <select v-model="testSlotAssignments[slot.name]" :title="`Model assignment for slot '${slot.name}'`">
              <option value="">— select model —</option>
              <option v-for="m in modelsStore.models" :key="m.id" :value="`${m.endpointId}::${m.providerModelName}`">
                {{ m.displayName }}
              </option>
            </select>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {ref, computed, watch, onMounted} from 'vue';
import type {CapsuleDefinition, StepType} from '@lorca/core';
import {useStepStaleStateMap} from '../../composables/useStepStaleStateMap.js';
import {autoAssignModelToStep} from '@lorca/endpoints';
import {useCapsuleStepEditorStore} from '../../stores/capsuleStepEditor.js';
import {useCapsuleRunStore} from '../../stores/capsuleRun.js';
import {useImportExportStore} from '../../stores/importExport.js';
import {useUiStore} from '../../stores/ui.js';
import {useCapsulesStore} from '../../stores/capsules.js';
import {useModelsStore} from '../../stores/models.js';
import {pickJsonFile} from '../../utils/importFile.js';
import ChainEditor from '../pipeline/ChainEditor.vue';
import {FieldLabel} from '@lorca/ui-kit';
import ExportModal from '../export/ExportModal.vue';

const props = defineProps<{capsule: CapsuleDefinition}>();
const emit = defineEmits<{update: [capsule: CapsuleDefinition]}>();

const capsuleRunStore = useCapsuleRunStore();
const importStore = useImportExportStore();
const uiStore = useUiStore();
const capsulesStore = useCapsulesStore();
const modelsStore = useModelsStore();
const editor = useCapsuleStepEditorStore();

const exportModal = ref<{open: boolean; json: string; filename: string}>({open: false, json: '', filename: ''});

const def = computed(() => editor.capsule ?? props.capsule);

onMounted(() => {
  editor.loadCapsule(props.capsule);
});

watch(() => props.capsule, (c) => {
  if (c.id !== editor.capsule?.id) editor.loadCapsule(c);
});

watch(() => editor.capsule, (c) => {
  if (c) emit('update', c);
}, {deep: true});

const localName = ref(props.capsule.name);
watch(() => def.value.name, (n) => { localName.value = n; });

function commitName() {
  const name = localName.value.trim() || 'Capsule';
  if (name !== def.value.name) editor.updateCapsuleName(name);
}

const testPrompt = ref(def.value.input?.raw ?? '');
watch(() => def.value.input?.raw, (raw) => { if (raw !== undefined) testPrompt.value = raw; });

const testInputValues = ref<Record<string, string>>({});
const testParamValues = ref<Record<string, string>>({});
const testSlotAssignments = ref<Record<string, string>>({});

const finalArtifactKey = computed(() => {
  const enabled = editor.steps.filter((s) => s.enabled);
  const last = enabled.at(-1);
  if (!last) return null;
  return `${last.outputNamespace}.${last.primaryOutputName}`;
});

const {map: stepStates} = useStepStaleStateMap(testPrompt);

function withDefaultModel(step: import('@lorca/core').PipelineStep) {
  return autoAssignModelToStep(step, modelsStore.models, step.type === 'model-call' ? 'general' : undefined);
}

function handleAppend(type: StepType) {
  if (editor.isReadOnly) return;
  const step = withDefaultModel(editor.buildDefaultStep(type));
  const id = editor.appendStep(step);
  editor.selectStep(id);
}

function handleInsertAfter(anchorStepId: string) {
  if (editor.isReadOnly) return;
  const anchor = editor.steps.find((s) => s.id === anchorStepId);
  const type: StepType = anchor?.type ?? 'model-call';
  const step = withDefaultModel(editor.buildDefaultStep(type));
  const id = editor.insertStepAfter(anchorStepId, step);
  editor.selectStep(id);
}

function handleInsertAt(index: number) {
  if (editor.isReadOnly) return;
  const step = withDefaultModel(editor.buildDefaultStep('model-call'));
  if (index === 0 && editor.steps.length > 0) {
    editor.insertStepBefore(editor.steps[0]!.id, step);
  } else {
    editor.appendStep(step);
  }
  editor.selectStep(step.id);
}

function handleMoveUp(stepId: string) {
  const idx = editor.steps.findIndex((s) => s.id === stepId);
  if (idx > 0) editor.moveStep(stepId, idx - 1);
}

function handleMoveDown(stepId: string) {
  const idx = editor.steps.findIndex((s) => s.id === stepId);
  if (idx < editor.steps.length - 1) editor.moveStep(stepId, idx + 1);
}

function handleDuplicate(stepId: string) {
  const newId = editor.duplicateStep(stepId);
  if (newId) editor.selectStep(newId);
}

function handleToggleEnabled(stepId: string) {
  const step = editor.steps.find((s) => s.id === stepId);
  if (step) editor.setStepEnabled(stepId, !step.enabled);
}

async function handleTestRun() {
  await runCapsule();
}

async function handleRunUpTo(stepId: string) {
  editor.updateUserPrompt(testPrompt.value.trim());
  await runCapsule(stepId);
}

async function runCapsule(stopAtStepId?: string) {
  const c = editor.getCapsule();
  if (!c) return;

  const inputValues: Record<string, unknown> = {};
  for (const port of c.interface.inputs) {
    const raw = testInputValues.value[port.name] ?? '';
    if (port.kind === 'json') {
      try { inputValues[port.name] = JSON.parse(raw); } catch { inputValues[port.name] = raw; }
    } else {
      inputValues[port.name] = raw;
    }
  }

  const paramValues: Record<string, unknown> = {};
  for (const param of c.interface.parameters) {
    const raw = testParamValues.value[param.name] ?? '';
    if (param.kind === 'number') paramValues[param.name] = Number(raw);
    else if (param.kind === 'boolean') paramValues[param.name] = raw === 'true';
    else if (param.kind === 'json') {
      try { paramValues[param.name] = JSON.parse(raw); } catch { paramValues[param.name] = raw; }
    } else {
      paramValues[param.name] = raw;
    }
  }

  const slotAssignments: Record<string, {endpointId: string; modelName: string}> = {};
  for (const slot of c.interface.modelSlots) {
    const val = testSlotAssignments.value[slot.name] ?? '';
    if (val) {
      const parts = val.split('::');
      slotAssignments[slot.name] = {endpointId: parts[0] ?? '', modelName: parts.slice(1).join('::')};
    }
  }

  uiStore.setRightPaneTab('trace');
  await capsuleRunStore.run(c, testPrompt.value, inputValues, paramValues, slotAssignments, stopAtStepId);
}

function handleLock() {
  if (!uiStore.activeCapsuleEditId) return;
  const result = capsulesStore.lockCapsuleById(uiStore.activeCapsuleEditId);
  if (!result.ok) alert(`Cannot lock: ${result.message}`);
}

function handleEditLocked() {
  if (!uiStore.activeCapsuleEditId) return;
  const newId = capsulesStore.editLockedCapsule(uiStore.activeCapsuleEditId);
  if (newId) uiStore.openCapsuleEditor(newId);
}

function handleExport() {
  const c = editor.getCapsule();
  if (!c) return;
  const {json, filename} = importStore.buildCapsuleExportJson(c);
  exportModal.value = {open: true, json, filename};
}

function handleImport() {
  pickJsonFile((text) => {
    try {
      const data = importStore.parseImportJson(text);
      importStore.beginCapsuleImport(data);
    } catch {
      importStore.setImportErrors(['Import file is not valid JSON']);
    }
  });
}
</script>

<style scoped>
.capsule-center { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

.capsule-toolbar {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.4rem 0.75rem; border-bottom: 1px solid #1e1e1e; flex-shrink: 0;
}
.capsule-name {
  flex: 1; background: transparent; border: none;
  color: #e8e8e8; font-size: 0.9rem; font-weight: 500;
}
.capsule-name:focus { outline: none; border-bottom: 1px solid #3a6080; }
.capsule-version { font-size: 0.68rem; color: #555; background: #1a1a1a; padding: 1px 6px; border-radius: 3px; }
.capsule-status { font-size: 0.68rem; padding: 1px 6px; border-radius: 3px; }
.status-draft { background: #2d2a1e; color: #c8a85a; }
.status-locked { background: #1e2d1e; color: #5ddb9e; }

.user-prompt-bar {
  display: flex; align-items: flex-start; gap: 0.5rem;
  padding: 0.4rem 0.75rem; border-bottom: 1px solid #1e1e1e; flex-shrink: 0;
}
.prompt-label { font-size: 0.68rem; color: #666; text-transform: uppercase; letter-spacing: 0.05em; padding-top: 4px; flex-shrink: 0; }
.user-prompt-input {
  flex: 1; background: #111; border: 1px solid #2a2a2a; color: #e8e8e8;
  border-radius: 3px; padding: 4px 6px; font-size: 0.82rem; resize: vertical; font-family: inherit;
}
.user-prompt-input:focus { outline: none; border-color: #3a6080; }

.capsule-chain { flex: 1; min-height: 0; }

.test-panel {
  border-top: 1px solid #1e1e1e; flex-shrink: 0;
  max-height: 220px; overflow-y: auto;
  background: #0d0d0d;
}
.test-panel-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 0.4rem 0.75rem; border-bottom: 1px solid #1e1e1e;
}
.test-panel-title { font-size: 0.72rem; font-weight: 600; color: #666; text-transform: uppercase; letter-spacing: 0.05em; }
.test-run-controls { display: flex; gap: 0.4rem; }
.test-fields { padding: 0.5rem 0.75rem; display: flex; flex-direction: column; gap: 0.4rem; }
.test-field { display: flex; flex-direction: column; gap: 0.15rem; }
.test-field input, .test-field textarea, .test-field select {
  background: #111; border: 1px solid #2a2a2a; color: #e8e8e8;
  border-radius: 3px; padding: 4px 6px; font-size: 0.82rem;
}
.test-field input:focus, .test-field textarea:focus, .test-field select:focus { outline: none; border-color: #3a6080; }
.test-field textarea { resize: vertical; font-family: inherit; }
.kind-badge { font-size: 0.65rem; color: #555; background: #1a1a1a; padding: 0 4px; border-radius: 2px; }

.btn { border-radius: 4px; padding: 3px 12px; font-size: 0.78rem; cursor: pointer; border: 1px solid #333; }
.btn-run { background: #1e3d52; border-color: #2a5070; color: #7ec8e3; }
.btn-run:hover:not(:disabled) { background: #254a62; }
.btn-run:disabled { opacity: 0.4; cursor: default; }
.btn-cancel { background: #2d1a1a; border-color: #4d2222; color: #e07070; }
.btn-cancel:hover { background: #3d2222; }
.btn-lock { background: #1e2d1e; border-color: #2a4d2a; color: #5ddb9e; padding: 2px 8px; font-size: 0.72rem; }
.btn-lock:hover { background: #253d25; }
.btn-edit { background: #2d2a1e; border-color: #4d3d1a; color: #c8a85a; padding: 2px 8px; font-size: 0.72rem; }
.btn-edit:hover { background: #3d3822; }
.btn-secondary { background: #1a1a1a; color: #aaa; padding: 2px 8px; font-size: 0.72rem; }
.btn-secondary:hover { background: #222; color: #ccc; }
</style>
