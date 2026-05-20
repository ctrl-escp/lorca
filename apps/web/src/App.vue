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
      <div class="header-actions">
        <span v-if="runStatus !== 'idle'" class="run-status" :class="`rs-${runStatus}`" :title="`Run status: ${runStatus}`">
          {{ runStatus }}
        </span>
        <button type="button" class="btn-help" title="Help — UI overview and workflow" @click="showAppHelp = true">?</button>
      </div>
    </header>
    <HelpDialog :open="showAppHelp" variant="app" @close="showAppHelp = false" />
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
          :key="`${pipelinesStore.activePipelineId ?? 'default-pipeline'}-${pipelineEditorKey}`"
          ref="centerPaneRef"
          :def="pipelinesStore.activePipeline"
          @update="onUpdateDef"
          @new="onNewPipeline"
        />
      </div>
      <PaneResizeHandle side="right" @resize="resizeRightPane" />
      <div class="pane pane-right" :style="{width: `${uiStore.rightPaneWidth}px`}">
        <RightPane
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
      :replaces-active-pipeline="importStore.pendingImport.kind === 'pipeline'"
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
import HelpDialog from './components/help/HelpDialog.vue';
import type {ModelRemap} from './stores/importExport.js';

const showAppHelp = ref(false);

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

const pipelineEditorKey = ref(0);

const activeCapsule = computed(() =>
  uiStore.activeCapsuleEditId
    ? capsulesStore.getCapsule(uiStore.activeCapsuleEditId)
    : undefined,
);

async function onUpdateDef(def: PipelineDefinition) {
  await pipelinesStore.save(def);
}

function onNewPipeline() {
  pipelineEditorKey.value++;
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
    runStore.reset();
    uiStore.closeCapsuleEditor();
    pipelineEditorKey.value++;
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
.header-actions { margin-left: auto; display: flex; align-items: center; gap: 0.5rem; }
.run-status { font-size: 0.72rem; padding: 2px 8px; border-radius: 3px; }
.btn-help {
  width: 1.4rem; height: 1.4rem; border-radius: 50%;
  background: #1a2a3a; border: 1px solid #2a5070; color: #7ec8e3;
  font-size: 0.78rem; cursor: pointer; line-height: 1;
}
.btn-help:hover { background: #254a62; }
.rs-running { background: #2d2a1e; color: #e8a020; }
.rs-completed { background: #1e2d1e; color: #5ddb9e; }
.rs-failed, .rs-cancelled { background: #2d1e1e; color: #e07070; }

.app-body { flex: 1; display: flex; min-height: 0; }

.pane { overflow: hidden; display: flex; flex-direction: column; min-width: 0; }
.pane-left { flex-shrink: 0; border-right: none; }
.pane-center { flex: 1; min-width: 0; }
.pane-right { flex-shrink: 0; border-left: none; }
</style>
