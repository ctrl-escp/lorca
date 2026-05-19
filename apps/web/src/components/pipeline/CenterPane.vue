<template>
  <div class="center-pane">
    <div class="center-toolbar">
      <input
        class="pipeline-name"
        v-model="localPipelineName"
        placeholder="Pipeline name"
        title="Display name for this pipeline (saved locally)"
        @change="commitPipelineName"
      />
      <div class="run-controls">
        <button class="btn btn-secondary" type="button" title="Export pipeline JSON" @click="handleExport">Export</button>
        <button class="btn btn-secondary" type="button" title="Import pipeline JSON" @click="handleImport">Import</button>
        <button
          class="btn btn-run"
          :disabled="runStore.isRunning || !canRun"
          :title="canRun ? 'Run the pipeline with the target prompt' : 'Enter a target prompt to enable Execute'"
          @click="handleRun"
        >
          {{ runStore.isRunning ? 'Running…' : 'Execute' }}
        </button>
        <button class="btn btn-cancel" v-if="runStore.isRunning" title="Stop the current pipeline run" @click="runStore.cancel">Cancel</button>
      </div>
    </div>

    <StepMainPrompt
      :node="selectedNode"
      :user-prompt="userPrompt"
      @update:user-prompt="userPrompt = $event"
      @update:node="onStepPromptNodeUpdate"
    />

    <ChainEditor
      :nodes="pipeline.nodes"
      :selected-node-id="uiStore.selectedNodeId"
      :trace="runStore.trace"
      :final-artifact-key="finalArtifactKey"
      :show-capsule-add="true"
      @select="uiStore.selectNode"
      @add="handleAddNode"
      @remove="editor.removeNode"
      @move-up="(id) => editor.moveNode(id, 'up')"
      @move-down="(id) => editor.moveNode(id, 'down')"
    />
  </div>
</template>

<script setup lang="ts">
import {ref, computed, watch} from 'vue';
import type {PipelineDefinition, PipelineNode} from '@lorca/core';
import {usePipelineEditor} from '../../composables/usePipelineEditor.js';
import {useActiveRunStore} from '../../stores/activeRun.js';
import {useImportExportStore} from '../../stores/importExport.js';
import {useUiStore} from '../../stores/ui.js';
import {pickJsonFile} from '../../utils/importFile.js';
import ChainEditor from './ChainEditor.vue';
import StepMainPrompt from './StepMainPrompt.vue';

const props = defineProps<{def: PipelineDefinition}>();
const emit = defineEmits<{update: [def: PipelineDefinition]}>();

const runStore = useActiveRunStore();
const importStore = useImportExportStore();
const uiStore = useUiStore();
const userPrompt = ref('');
const localPipelineName = ref(props.def.name);
const editor = usePipelineEditor(props.def);
const {def: pipeline, finalArtifactKey, updateNode} = editor;

defineExpose({updateNode});

watch(() => props.def.name, (name) => {
  localPipelineName.value = name;
});

function commitPipelineName() {
  if (localPipelineName.value === pipeline.value.name) return;
  pipeline.value = {...pipeline.value, name: localPipelineName.value};
}

watch(localPipelineName, () => commitPipelineName());

const selectedNode = computed(() =>
  uiStore.selectedNodeId ? pipeline.value.nodes.find((n) => n.id === uiStore.selectedNodeId) ?? null : null,
);
const canRun = computed(() => userPrompt.value.trim().length > 0);

function onStepPromptNodeUpdate(patch: Record<string, unknown>) {
  if (uiStore.selectedNodeId) updateNode(uiStore.selectedNodeId, patch);
}

watch(pipeline, (newDef) => emit('update', newDef), {deep: true});

function handleAddNode(type: PipelineNode['type']) {
  const nodeId = editor.addNode(type);
  if (nodeId) uiStore.selectNodeAndInspect(nodeId);
}

async function handleRun() {
  await runStore.run(pipeline.value, userPrompt.value.trim());
}

function handleExport() {
  importStore.exportCurrentPipeline(pipeline.value);
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
</script>

<style scoped>
.center-pane { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.center-toolbar { display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0.75rem; border-bottom: 1px solid #1e1e1e; flex-shrink: 0; }
.pipeline-name { flex: 1; background: transparent; border: none; color: #e8e8e8; font-size: 0.9rem; font-weight: 500; }
.pipeline-name:focus { outline: none; border-bottom: 1px solid #3a6080; }
.run-controls { display: flex; gap: 0.4rem; }
.btn { border-radius: 4px; padding: 4px 14px; font-size: 0.82rem; cursor: pointer; border: 1px solid #333; }
.btn-run { background: #1e3d52; border-color: #2a5070; color: #7ec8e3; }
.btn-run:hover:not(:disabled) { background: #254a62; }
.btn-run:disabled { opacity: 0.4; cursor: default; }
.btn-secondary { background: #1a1a1a; color: #aaa; }
.btn-secondary:hover { background: #222; color: #ccc; }
.btn-cancel { background: #2d1a1a; border-color: #4d2222; color: #e07070; }
.btn-cancel:hover { background: #3d2222; }
</style>
