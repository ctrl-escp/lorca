<template>
  <div class="app">
    <header class="app-header">
      <h1>Lorca</h1>
      <span class="app-subtitle">Local AI Orchestrator</span>
      <span v-if="runStore.status !== 'idle'" class="run-status" :class="`rs-${runStore.status}`">
        {{ runStore.status }}
      </span>
    </header>
    <main class="app-body">
      <div class="pane pane-left">
        <LeftPane />
      </div>
      <div class="pane pane-center">
        <CenterPane :def="activeDef" @update="onUpdateDef" />
      </div>
      <div class="pane pane-right">
        <RightPane :nodes="activeDef.nodes" :on-update="onUpdateNode" />
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import {ref, onMounted} from 'vue';
import type {PipelineDefinition} from '@lorca/core';
import {useActiveRunStore} from './stores/activeRun.js';
import {useEndpointsStore} from './stores/endpoints.js';
import {useModelsStore} from './stores/models.js';
import {usePipelineEditor} from './composables/usePipelineEditor.js';
import LeftPane from './components/LeftPane.vue';
import CenterPane from './components/pipeline/CenterPane.vue';
import RightPane from './components/RightPane.vue';

const runStore = useActiveRunStore();

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

function onUpdateDef(def: PipelineDefinition) {
  activeDef.value = def;
}

function onUpdateNode(nodeId: string, patch: Record<string, unknown>) {
  editor.updateNode(nodeId, patch);
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
  gap: 0.75rem;
  padding: 0.4rem 1rem;
  border-bottom: 1px solid #2a2a2a;
  flex-shrink: 0;
}
.app-header h1 { margin: 0; font-size: 0.95rem; font-weight: 600; letter-spacing: 0.05em; }
.app-subtitle { font-size: 0.72rem; color: #555; }
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
