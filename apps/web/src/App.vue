<template>
  <div class="app">
    <header class="app-header">
      <h1>Lorca</h1>
      <template v-if="uiStore.editorContext === 'capsule' && activeCapsule">
        <button class="breadcrumb-back" title="Return to pipeline editor" @click="uiStore.closeCapsuleEditor()">← Pipeline</button>
        <span class="breadcrumb-sep">›</span>
        <span class="breadcrumb-label">{{ activeCapsule.name || 'Capsule' }}</span>
      </template>
      <span v-else class="app-subtitle">Local AI Orchestrator</span>
      <span v-if="runStatus !== 'idle'" class="run-status" :class="`rs-${runStatus}`" :title="`Run status: ${runStatus}`">
        {{ runStatus }}
      </span>
    </header>
    <ImportErrorBanner
      v-if="importStore.importErrors.length > 0"
      :errors="importStore.importErrors"
      @dismiss="importStore.cancelImport()"
    />
    <main class="app-body">
      <div class="pane pane-left" :style="{width: `${uiStore.leftPaneWidth}px`}">
        <LeftPane />
      </div>
      <PaneResizeHandle side="left" @resize="resizeLeftPane" />
      <div class="pane pane-center">
        <CapsuleCenterPane
          v-if="uiStore.editorContext === 'capsule' && activeCapsule"
          ref="capsuleCenterPaneRef"
          :capsule="activeCapsule"
          @update="onUpdateCapsule"
        />
        <CenterPane
          v-else-if="pipelinesStore.loaded && pipelinesStore.activePipeline"
          :key="pipelinesStore.activePipelineId ?? 'default-pipeline'"
          ref="centerPaneRef"
          :def="pipelinesStore.activePipeline"
          @update="onUpdateDef"
        />
      </div>
      <PaneResizeHandle side="right" @resize="resizeRightPane" />
      <div class="pane pane-right" :style="{width: `${uiStore.rightPaneWidth}px`}">
        <RightPane
          :nodes="activeNodes"
          :on-update="onUpdateNode"
          v-bind="uiStore.editorContext === 'capsule' && activeCapsule ? {capsule: activeCapsule, onUpdateCapsuleInterface} : {}"
        />
      </div>
    </main>

    <ImportRemapDialog
      v-if="importStore.pendingImport"
      :open="true"
      :kind="importStore.pendingImport.kind"
      :missing-models="pendingMissingModels"
      :models="modelsStore.models"
      :endpoints="endpointsStore.endpoints"
      @cancel="importStore.cancelImport()"
      @confirm="onConfirmImport"
    />
  </div>
</template>

<script setup lang="ts">
import {ref, computed, onMounted} from 'vue';
import type {PipelineDefinition, CapsuleInterface} from '@lorca/core';
import {useActiveRunStore} from './stores/activeRun.js';
import {useCapsuleRunStore} from './stores/capsuleRun.js';
import {useEndpointsStore} from './stores/endpoints.js';
import {useModelsStore} from './stores/models.js';
import {usePipelinesStore} from './stores/pipelines.js';
import {useCapsulesStore} from './stores/capsules.js';
import {useImportExportStore} from './stores/importExport.js';
import {useUiStore} from './stores/ui.js';
import LeftPane from './components/LeftPane.vue';
import CenterPane from './components/pipeline/CenterPane.vue';
import CapsuleCenterPane from './components/capsule/CapsuleCenterPane.vue';
import RightPane from './components/RightPane.vue';
import ImportRemapDialog from './components/import/ImportRemapDialog.vue';
import ImportErrorBanner from './components/import/ImportErrorBanner.vue';
import PaneResizeHandle from './components/layout/PaneResizeHandle.vue';
import type {ModelRemap} from './stores/importExport.js';

const runStore = useActiveRunStore();
const capsuleRunStore = useCapsuleRunStore();
const uiStore = useUiStore();
const pipelinesStore = usePipelinesStore();
const capsulesStore = useCapsulesStore();
const importStore = useImportExportStore();
const endpointsStore = useEndpointsStore();
const modelsStore = useModelsStore();

const runStatus = computed(() =>
  uiStore.editorContext === 'capsule' ? capsuleRunStore.status : runStore.status,
);

type NodeEditorPane = {updateNode: (nodeId: string, patch: Record<string, unknown>) => void};

const centerPaneRef = ref<NodeEditorPane | null>(null);
const capsuleCenterPaneRef = ref<NodeEditorPane | null>(null);

// Tracks the live pipeline definition as edited in CenterPane.
// Starts null; gets set on first CenterPane update emit so the right pane
// node list stays in sync with CenterPane's internal editor state.
const currentDef = ref<PipelineDefinition | null>(null);

const activeCapsule = computed(() =>
  uiStore.activeCapsuleEditId
    ? capsulesStore.getCapsule(uiStore.activeCapsuleEditId)
    : undefined,
);

const activeNodes = computed(() => {
  if (uiStore.editorContext === 'capsule' && activeCapsule.value) {
    return activeCapsule.value.nodes;
  }
  return (currentDef.value ?? pipelinesStore.activePipeline)?.nodes ?? [];
});

async function onUpdateDef(def: PipelineDefinition) {
  currentDef.value = def;
  await pipelinesStore.save(def);
}

function onUpdateNode(nodeId: string, patch: Record<string, unknown>) {
  if (uiStore.editorContext === 'capsule') {
    capsuleCenterPaneRef.value?.updateNode(nodeId, patch);
  } else {
    centerPaneRef.value?.updateNode(nodeId, patch);
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

const pendingMissingModels = computed(() =>
  importStore.pendingImport?.kind === 'pipeline'
    ? importStore.pendingImport.preview.missingModels
    : importStore.pendingImport?.kind === 'capsule'
      ? importStore.pendingImport.preview.missingModels
      : [],
);

async function onConfirmImport(remaps: Record<string, ModelRemap>) {
  const result = await importStore.confirmImport(remaps);
  if (result?.kind === 'capsule') {
    uiStore.openCapsuleEditor(result.id);
  } else if (result?.kind === 'pipeline') {
    uiStore.closeCapsuleEditor();
  }
}

function resizeLeftPane(delta: number) {
  uiStore.leftPaneWidth = Math.min(520, Math.max(180, uiStore.leftPaneWidth + delta));
}

function resizeRightPane(delta: number) {
  uiStore.rightPaneWidth = Math.min(640, Math.max(260, uiStore.rightPaneWidth + delta));
}

onMounted(async () => {
  await useEndpointsStore().load();
  await useModelsStore().load();
  await pipelinesStore.load();
  await capsulesStore.load();
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

.pane { overflow: hidden; display: flex; flex-direction: column; min-width: 0; }
.pane-left { flex-shrink: 0; border-right: none; }
.pane-center { flex: 1; min-width: 0; }
.pane-right { flex-shrink: 0; border-left: none; }
</style>
