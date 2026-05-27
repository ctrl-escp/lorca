<template>
  <div class="app">
    <header class="app-header">
      <button class="mobile-panel-btn" aria-label="Toggle library panel" @click="mobileRightOpen = false; mobileLeftOpen = !mobileLeftOpen">☰</button>
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
        <button
          type="button"
          class="btn-header"
          :disabled="!canUndo"
          :title="canUndo ? `Undo ${undoLabel}` : 'Undo'"
          @click="doUndo"
        >
          ↩
        </button>
        <button
          type="button"
          class="btn-header"
          :disabled="!canRedo"
          :title="canRedo ? `Redo ${redoLabel}` : 'Redo'"
          @click="doRedo"
        >
          ↪
        </button>
        <button type="button" class="btn-help" title="Help — UI overview and workflow" @click="showAppHelp = true">?</button>
        <button class="mobile-panel-btn" aria-label="Toggle inspector panel" @click="mobileLeftOpen = false; mobileRightOpen = !mobileRightOpen">⊞</button>
      </div>
    </header>
    <HelpDialog :open="showAppHelp" variant="app" @close="showAppHelp = false" />
    <CorsProxyBanner />
    <ImportErrorBanner
      v-if="importStore.importErrors.length > 0"
      :errors="importStore.importErrors"
      @dismiss="importStore.cancelImport()"
    />
    <main ref="appBodyRef" class="app-body">
      <div
        class="panel-overlay"
        :class="{visible: mobileLeftOpen || mobileRightOpen}"
        @click="mobileLeftOpen = false; mobileRightOpen = false"
      />
      <div class="pane pane-left" :class="{'mobile-open': mobileLeftOpen}" :style="{flex: uiStore.leftPaneFlex}">
        <LeftPane />
      </div>
      <PaneResizeHandle side="left" @resize="resizeLeftPane" />
      <div class="pane pane-center" :style="{flex: 8 - uiStore.leftPaneFlex - uiStore.rightPaneFlex}">
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
      <div class="pane pane-right" :class="{'mobile-open': mobileRightOpen}" :style="{flex: uiStore.rightPaneFlex}">
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
import {ref, computed, onMounted, watch} from 'vue';
import type {PipelineDefinition, CapsuleInterface} from '@lorca/core';
import {useActiveRunStore} from './stores/activeRun.js';
import {useCapsuleRunStore} from './stores/capsuleRun.js';
import {useEndpointsStore} from './stores/endpoints.js';
import {useModelsStore} from './stores/models.js';
import {usePipelinesStore} from './stores/pipelines.js';
import {useCapsulesStore} from './stores/capsules.js';
import {useImportExportStore} from './stores/importExport.js';
import {useUiStore} from './stores/ui.js';
import {usePipelineEditorStore} from './stores/pipelineEditor.js';
import {useCapsuleStepEditorStore} from './stores/capsuleStepEditor.js';
import LeftPane from './components/LeftPane.vue';
import CenterPane from './components/pipeline/CenterPane.vue';
import CapsuleCenterPane from './components/capsule/CapsuleCenterPane.vue';
import RightPane from './components/RightPane.vue';
import ImportRemapDialog from './components/import/ImportRemapDialog.vue';
import ImportErrorBanner from './components/import/ImportErrorBanner.vue';
import PaneResizeHandle from './components/layout/PaneResizeHandle.vue';
import HelpDialog from './components/help/HelpDialog.vue';
import CorsProxyBanner from './components/CorsProxyBanner.vue';
import type {ModelRemap} from './stores/importExport.js';

const showAppHelp = ref(false);
const mobileLeftOpen = ref(false);
const mobileRightOpen = ref(false);

watch([mobileLeftOpen, mobileRightOpen], ([l, r]) => {
  document.body.style.overflow = l || r ? 'hidden' : '';
});

const runStore = useActiveRunStore();
const capsuleRunStore = useCapsuleRunStore();
const uiStore = useUiStore();
const pipelinesStore = usePipelinesStore();
const capsulesStore = useCapsulesStore();
const importStore = useImportExportStore();
const endpointsStore = useEndpointsStore();
const modelsStore = useModelsStore();
const pipelineEditorStore = usePipelineEditorStore();
const capsuleStepEditorStore = useCapsuleStepEditorStore();

const runStatus = computed(() =>
  uiStore.editorContext === 'capsule' ? capsuleRunStore.status : runStore.status,
);

const canUndo = computed(() =>
  uiStore.editorContext === 'capsule' ? capsuleStepEditorStore.canUndo : pipelineEditorStore.canUndo,
);
const canRedo = computed(() =>
  uiStore.editorContext === 'capsule' ? capsuleStepEditorStore.canRedo : pipelineEditorStore.canRedo,
);
const undoLabel = computed(() =>
  uiStore.editorContext === 'capsule' ? capsuleStepEditorStore.lastUndoLabel : pipelineEditorStore.lastUndoLabel,
);
const redoLabel = computed(() =>
  uiStore.editorContext === 'capsule' ? capsuleStepEditorStore.lastRedoLabel : pipelineEditorStore.lastRedoLabel,
);

function doUndo() {
  if (uiStore.editorContext === 'capsule') capsuleStepEditorStore.undo();
  else pipelineEditorStore.undo();
}

function doRedo() {
  if (uiStore.editorContext === 'capsule') capsuleStepEditorStore.redo();
  else pipelineEditorStore.redo();
}

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

const appBodyRef = ref<HTMLElement | null>(null);

function resizeLeftPane(delta: number) {
  const W = appBodyRef.value?.offsetWidth ?? window.innerWidth;
  const flexDelta = (delta / W) * 8;
  const maxLeft = 8 - uiStore.rightPaneFlex - 1;
  uiStore.leftPaneFlex = Math.min(maxLeft, Math.max(1, uiStore.leftPaneFlex + flexDelta));
}

function resizeRightPane(delta: number) {
  const W = appBodyRef.value?.offsetWidth ?? window.innerWidth;
  const flexDelta = (delta / W) * 8;
  const maxRight = 8 - uiStore.leftPaneFlex - 1;
  uiStore.rightPaneFlex = Math.min(maxRight, Math.max(1, uiStore.rightPaneFlex + flexDelta));
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

:root {
  --text-section: #8f8f8f;
  --text-muted: #888;
  --text-secondary: #999;
  --text-label: #aaa;
  --text-tab: var(--text-secondary);
  --text-tab-hover: #bbb;
  --border-divider: #2a2a2a;

  /* Primary accent — chocolate (replaces former cyan #7ec8e3) */
  --accent: #D2691E;
  --accent-bg: #2a1810;
  --accent-bg-hover: #352010;
  --accent-border: #6b4226;
  --accent-bg-muted: #1a1410;
  --accent-border-muted: #4a3220;

  /* Semantic section header colors — visual mnemonics by content type */
  --header-input: #6dbcd8;
  --header-output: #6db86d;
  --header-history: #a898d8;
  --header-prompt: var(--accent);
  --header-preview: #8ab8c8;
  --header-config: #c8a85a;
  --header-model: #9d6db8;
  --header-loop: #9ab8d0;
  --header-capsule: #b088d8;
  --header-trace: #8080c0;
  --header-library: var(--accent);
  --header-endpoint: #5ddb9e;
  --header-artifact: #d19a66;
  --header-ai: #9adcf0;
}

/* Reusable section header color classes */
.hdr-input    { color: var(--header-input); }
.hdr-output   { color: var(--header-output); }
.hdr-history  { color: var(--header-history); }
.hdr-prompt   { color: var(--header-prompt); }
.hdr-preview  { color: var(--header-preview); }
.hdr-config   { color: var(--header-config); }
.hdr-model    { color: var(--header-model); }
.hdr-loop     { color: var(--header-loop); }
.hdr-capsule  { color: var(--header-capsule); }
.hdr-trace    { color: var(--header-trace); }
.hdr-library  { color: var(--header-library); }
.hdr-endpoint { color: var(--header-endpoint); }
.hdr-artifact { color: var(--header-artifact); }
.hdr-ai       { color: var(--header-ai); }

body {
  margin: 0;
  font-family: system-ui, sans-serif;
  background: #0f0f0f;
  color: #e8e8e8;
}

input,
textarea {
  caret-color: #e8e8e8;
}

.app { display: flex; flex-direction: column; height: 100vh; height: 100dvh; overflow: hidden; }

.app-header {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.6rem 1rem;
  border-bottom: 1px solid #2a2a2a;
  flex-shrink: 0;
  position: relative;
  z-index: 10;
}
.app-header h1 { margin: 0; font-size: 1.1rem; font-weight: 600; letter-spacing: 0.05em; }
.app-subtitle { font-size: 0.82rem; color: var(--text-secondary); }
.breadcrumb-back { background: none; border: none; color: var(--accent); font-size: 0.88rem; cursor: pointer; padding: 0; }
.breadcrumb-back:hover { text-decoration: underline; }
.breadcrumb-sep { color: var(--text-muted); font-size: 0.88rem; }
.breadcrumb-label { font-size: 0.88rem; color: var(--text-label); }
.header-actions { margin-left: auto; display: flex; align-items: center; gap: 0.6rem; }
.run-status { font-size: 0.82rem; padding: 3px 10px; border-radius: 4px; }
.btn-header {
  width: 2rem; height: 2rem; border-radius: 6px;
  background: #1a1a1a; border: 1px solid #333; color: #ccc;
  font-size: 1.1rem; cursor: pointer; line-height: 1;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s ease;
}
.btn-header:hover:not(:disabled) { background: #2a2a2a; color: #fff; }
.btn-header:disabled { opacity: 0.3; cursor: not-allowed; }

.btn-help {
  width: 2rem; height: 2rem; border-radius: 50%;
  background: var(--accent-bg-muted); border: 1px solid var(--accent-border); color: var(--accent);
  font-size: 0.9rem; cursor: pointer; line-height: 1;
  display: flex; align-items: center; justify-content: center;
}
.btn-help:hover { background: var(--accent-bg-hover); }
.rs-running { background: #2d2a1e; color: #e8a020; }
.rs-completed { background: #1e2d1e; color: #5ddb9e; }
.rs-failed, .rs-cancelled { background: #2d1e1e; color: #e07070; }

/* Mobile-only panel toggle buttons */
.mobile-panel-btn { display: none; }

/* Mobile overlay */
.panel-overlay { display: none; }

.app-body { flex: 1; display: flex; min-height: 0; }

.pane { overflow: hidden; display: flex; flex-direction: column; min-width: 0; }
.pane-left { min-width: 150px; }
.pane-center { min-width: 200px; }
.pane-right { min-width: 200px; }

/* ── Mobile layout ─────────────────────────────── */
@media (max-width: 767px) {
  .mobile-panel-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    background: none;
    border: 1px solid #333;
    border-radius: 6px;
    color: var(--text-label);
    font-size: 1.2rem;
    cursor: pointer;
    flex-shrink: 0;
  }
  .mobile-panel-btn:hover { background: #1a1a1a; color: #ccc; }

  .app-subtitle { display: none; }

  .panel-overlay {
    display: block;
    position: absolute;
    inset: 0;
    z-index: 100;
    background: rgba(0, 0, 0, 0.65);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.22s;
  }
  .panel-overlay.visible { opacity: 1; pointer-events: auto; }

  .app-body { position: relative; overflow: hidden; }

  .pane-left {
    position: absolute !important;
    top: 0; left: 0; bottom: 0;
    width: min(85vw, 380px) !important;
    z-index: 101;
    transform: translateX(-100%);
    transition: transform 0.25s ease;
    border-right: 1px solid #2a2a2a;
    background: #0f0f0f;
  }
  .pane-left.mobile-open { transform: translateX(0); }

  .pane-right {
    position: absolute !important;
    top: 0; right: 0; bottom: 0;
    width: min(85vw, 380px) !important;
    z-index: 101;
    transform: translateX(100%);
    transition: transform 0.25s ease;
    border-left: 1px solid #2a2a2a;
    background: #0f0f0f;
  }
  .pane-right.mobile-open { transform: translateX(0); }

  .pane-resize-handle { display: none !important; }
}
</style>
