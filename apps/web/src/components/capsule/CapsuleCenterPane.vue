<template>
  <div class="capsule-center">
    <div class="capsule-toolbar">
      <input class="capsule-name" v-model="localName" @blur="editor.updateMeta({name: localName})" placeholder="Capsule name" :readonly="def.status === 'locked'" />
      <span class="capsule-version">{{ def.version }}</span>
      <span class="capsule-status" :class="`status-${def.status}`">{{ def.status }}</span>
      <button v-if="def.status === 'draft'" class="btn btn-lock" @click="handleLock">Lock</button>
      <button v-else class="btn btn-edit" @click="handleEditLocked">Edit (new draft)</button>
    </div>

    <ChainEditor
      :nodes="def.nodes"
      :selected-node-id="uiStore.selectedNodeId"
      :trace="capsuleRunStore.trace"
      :final-artifact-key="finalArtifactKey"
      @select="uiStore.selectNode"
      @add="editor.addNode"
      @remove="editor.removeNode"
      @move-up="(id) => editor.moveNode(id, 'up')"
      @move-down="(id) => editor.moveNode(id, 'down')"
    />

    <!-- Test run panel -->
    <div class="test-panel">
      <div class="test-panel-header">
        <span class="test-panel-title">Test Run</span>
        <div class="test-run-controls">
          <button class="btn btn-run" :disabled="capsuleRunStore.isRunning" @click="handleTestRun">
            {{ capsuleRunStore.isRunning ? 'Running…' : 'Test' }}
          </button>
          <button class="btn btn-cancel" v-if="capsuleRunStore.isRunning" @click="capsuleRunStore.cancel">Cancel</button>
        </div>
      </div>

      <div class="test-fields">
        <div class="test-field">
          <label>User prompt</label>
          <textarea v-model="testPrompt" rows="2" placeholder="Test prompt for InputNode…" />
        </div>

        <!-- Input port values -->
        <template v-if="def.interface.inputs.length > 0">
          <div v-for="port in def.interface.inputs" :key="port.name" class="test-field">
            <label>{{ port.name }} <span class="kind-badge">{{ port.kind }}</span></label>
            <textarea v-model="testInputValues[port.name]" rows="2" :placeholder="port.kind === 'json' ? '{}' : ''" />
          </div>
        </template>

        <!-- Parameter values -->
        <template v-if="def.interface.parameters.length > 0">
          <div v-for="param in def.interface.parameters" :key="param.name" class="test-field">
            <label>param: {{ param.name }} <span class="kind-badge">{{ param.kind }}</span></label>
            <input v-model="testParamValues[param.name]" :placeholder="param.kind" />
          </div>
        </template>

        <!-- Slot assignments -->
        <template v-if="def.interface.modelSlots.length > 0">
          <div v-for="slot in def.interface.modelSlots" :key="slot.name" class="test-field">
            <label>slot: {{ slot.name }}</label>
            <select v-model="testSlotAssignments[slot.name]">
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
import {ref, computed, watch} from 'vue';
import type {CapsuleDefinition} from '@lorca/core';
import {useCapsuleEditor} from '../../composables/useCapsuleEditor.js';
import {useCapsuleRunStore} from '../../stores/capsuleRun.js';
import {useUiStore} from '../../stores/ui.js';
import {useCapsulesStore} from '../../stores/capsules.js';
import {useModelsStore} from '../../stores/models.js';
import {resolveOutputRef} from '@lorca/pipeline';
import ChainEditor from '../pipeline/ChainEditor.vue';

const props = defineProps<{capsule: CapsuleDefinition}>();
const emit = defineEmits<{update: [capsule: CapsuleDefinition]}>();

const capsuleRunStore = useCapsuleRunStore();
const uiStore = useUiStore();
const capsulesStore = useCapsulesStore();
const modelsStore = useModelsStore();

const editor = useCapsuleEditor(props.capsule);
const {def} = editor;

watch(def, (updated) => emit('update', updated));
watch(() => props.capsule, (c) => { if (c.id !== def.value.id) Object.assign(def.value, structuredClone(c)); });

const localName = ref(props.capsule.name);
watch(() => def.value.name, (n) => { localName.value = n; });

const finalArtifactKey = computed(() => resolveOutputRef(def.value.outputRef, def.value.nodes));

const testPrompt = ref('');
const testInputValues = ref<Record<string, string>>({});
const testParamValues = ref<Record<string, string>>({});
const testSlotAssignments = ref<Record<string, string>>({});

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

async function handleTestRun() {
  const inputValues: Record<string, unknown> = {};
  for (const port of def.value.interface.inputs) {
    const raw = testInputValues.value[port.name] ?? '';
    if (port.kind === 'json') {
      try { inputValues[port.name] = JSON.parse(raw); } catch { inputValues[port.name] = raw; }
    } else {
      inputValues[port.name] = raw;
    }
  }

  const paramValues: Record<string, unknown> = {};
  for (const param of def.value.interface.parameters) {
    const raw = testParamValues.value[param.name] ?? '';
    if (param.kind === 'number') paramValues[param.name] = Number(raw);
    else if (param.kind === 'boolean') paramValues[param.name] = raw === 'true';
    else if (param.kind === 'json') { try { paramValues[param.name] = JSON.parse(raw); } catch { paramValues[param.name] = raw; } }
    else paramValues[param.name] = raw;
  }

  const slotAssignments: Record<string, {endpointId: string; modelName: string}> = {};
  for (const slot of def.value.interface.modelSlots) {
    const val = testSlotAssignments.value[slot.name] ?? '';
    if (val) {
      const parts = val.split('::');
      slotAssignments[slot.name] = {endpointId: parts[0] ?? '', modelName: parts.slice(1).join('::')};
    }
  }

  uiStore.setRightPaneTab('output');
  await capsuleRunStore.run(def.value, testPrompt.value, inputValues, paramValues, slotAssignments);
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

.test-panel {
  border-top: 1px solid #1e1e1e; flex-shrink: 0;
  max-height: 280px; overflow-y: auto;
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
.test-field label { font-size: 0.7rem; color: #666; }
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
</style>
