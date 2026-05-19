<template>
  <div class="app">
    <header class="app-header">
      <h1>Lorca</h1>
      <template v-if="uiStore.editorContext === 'capsule' && activeCapsule">
        <button class="breadcrumb-back" @click="uiStore.closeCapsuleEditor()">← Pipeline</button>
        <span class="breadcrumb-sep">›</span>
        <span class="breadcrumb-label">{{ activeCapsule.name || 'Capsule' }}</span>
      </template>
      <span v-else class="app-subtitle">Local AI Orchestrator</span>
      <span v-if="runStatus !== 'idle'" class="run-status" :class="`rs-${runStatus}`">
        {{ runStatus }}
      </span>
    </header>
    <main class="app-body">
      <div class="pane pane-left">
        <LeftPane />
      </div>
      <div class="pane pane-center">
        <CapsuleCenterPane
          v-if="uiStore.editorContext === 'capsule' && activeCapsule"
          :capsule="activeCapsule"
          @update="onUpdateCapsule"
        />
        <CenterPane
          v-else
          :def="activeDef"
          @update="onUpdateDef"
        />
      </div>
      <div class="pane pane-right">
        <RightPane
          :nodes="activeNodes"
          :on-update="onUpdateNode"
          v-bind="uiStore.editorContext === 'capsule' && activeCapsule ? {capsule: activeCapsule, onUpdateCapsuleInterface} : {}"
        />
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import {ref, computed, onMounted} from 'vue';
import type {PipelineDefinition, CapsuleInterface} from '@lorca/core';
import {useActiveRunStore} from './stores/activeRun.js';
import {useCapsuleRunStore} from './stores/capsuleRun.js';
import {useEndpointsStore} from './stores/endpoints.js';
import {useModelsStore} from './stores/models.js';
import {useCapsulesStore} from './stores/capsules.js';
import {useUiStore} from './stores/ui.js';
import {usePipelineEditor} from './composables/usePipelineEditor.js';
import LeftPane from './components/LeftPane.vue';
import CenterPane from './components/pipeline/CenterPane.vue';
import CapsuleCenterPane from './components/capsule/CapsuleCenterPane.vue';
import RightPane from './components/RightPane.vue';

const runStore = useActiveRunStore();
const capsuleRunStore = useCapsuleRunStore();
const uiStore = useUiStore();
const capsulesStore = useCapsulesStore();

const runStatus = computed(() =>
  uiStore.editorContext === 'capsule' ? capsuleRunStore.status : runStore.status,
);

const DEFAULT_PIPELINE: PipelineDefinition = {
  schemaVersion: 1,
  id: 'default',
  name: 'New Pipeline',
  inputArtifactName: 'user_prompt',
  nodes: [{id: 'input-1', type: 'input'}],
  edges: [],
  outputRef: {nodeId: 'input-1', outputName: 'xml'},
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const editor = usePipelineEditor(DEFAULT_PIPELINE);
const activeDef = editor.def;

const activeCapsule = computed(() =>
  uiStore.activeCapsuleEditId
    ? capsulesStore.getCapsule(uiStore.activeCapsuleEditId)
    : undefined,
);

const activeNodes = computed(() =>
  uiStore.editorContext === 'capsule' && activeCapsule.value
    ? activeCapsule.value.nodes
    : activeDef.value.nodes,
);

function onUpdateDef(def: PipelineDefinition) {
  activeDef.value = def;
}

function onUpdateNode(nodeId: string, patch: Record<string, unknown>) {
  if (uiStore.editorContext === 'capsule' && uiStore.activeCapsuleEditId) {
    const cap = capsulesStore.getCapsule(uiStore.activeCapsuleEditId);
    if (!cap) return;
    const updated = {
      ...cap,
      nodes: cap.nodes.map((n) => n.id === nodeId ? deepMerge(n as unknown as Record<string, unknown>, patch) as unknown as typeof n : n),
      updatedAt: new Date().toISOString(),
    };
    capsulesStore.updateCapsule(uiStore.activeCapsuleEditId, updated);
  } else {
    editor.updateNode(nodeId, patch);
  }
}

function onUpdateCapsule(capsule: typeof activeCapsule.value) {
  if (capsule && uiStore.activeCapsuleEditId) {
    capsulesStore.updateCapsule(uiStore.activeCapsuleEditId, capsule);
  }
}

function onUpdateCapsuleInterface(iface: CapsuleInterface) {
  if (uiStore.activeCapsuleEditId) {
    capsulesStore.updateCapsule(uiStore.activeCapsuleEditId, {
      interface: iface,
      updatedAt: new Date().toISOString(),
    });
  }
}

function deepMerge(target: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out = {...target};
  for (const [k, v] of Object.entries(patch)) {
    if (v !== null && typeof v === 'object' && !Array.isArray(v) && typeof out[k] === 'object' && out[k] !== null) {
      out[k] = deepMerge(out[k] as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

onMounted(async () => {
  await useEndpointsStore().load();
  await useModelsStore().load();
});
</script>

<style>
*, *::before, *::after { box-sizing: border-box; }

body {
  margin: 0;
  font-family: system-ui, sans-serif;
  background: #0f0f0f;
  color: #e8e8e8;
}

.app { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }

.app-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 1rem;
  border-bottom: 1px solid #2a2a2a;
  flex-shrink: 0;
}
.app-header h1 { margin: 0; font-size: 0.95rem; font-weight: 600; letter-spacing: 0.05em; }
.app-subtitle { font-size: 0.72rem; color: #555; }
.breadcrumb-back { background: none; border: none; color: #7ec8e3; font-size: 0.78rem; cursor: pointer; padding: 0; }
.breadcrumb-back:hover { text-decoration: underline; }
.breadcrumb-sep { color: #444; font-size: 0.78rem; }
.breadcrumb-label { font-size: 0.78rem; color: #888; }
.run-status { margin-left: auto; font-size: 0.72rem; padding: 2px 8px; border-radius: 3px; }
.rs-running { background: #2d2a1e; color: #e8a020; }
.rs-completed { background: #1e2d1e; color: #5ddb9e; }
.rs-failed, .rs-cancelled { background: #2d1e1e; color: #e07070; }

.app-body { flex: 1; display: flex; min-height: 0; }

.pane { overflow: hidden; display: flex; flex-direction: column; }
.pane-left { width: 280px; flex-shrink: 0; border-right: 1px solid #2a2a2a; }
.pane-center { flex: 1; min-width: 0; }
.pane-right { width: 360px; flex-shrink: 0; }
</style>
