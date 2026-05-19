<template>
  <div class="center-pane">
    <div class="center-toolbar">
      <input class="pipeline-name" v-model="def.name" placeholder="Pipeline name" />
      <div class="run-controls">
        <button class="btn btn-run" :disabled="runStore.isRunning || !canRun" @click="handleRun">
          {{ runStore.isRunning ? 'Running…' : 'Execute' }}
        </button>
        <button class="btn btn-cancel" v-if="runStore.isRunning" @click="runStore.cancel">Cancel</button>
      </div>
    </div>

    <div class="prompt-input">
      <label>Target prompt</label>
      <textarea v-model="userPrompt" rows="3" placeholder="Enter your target prompt…" />
    </div>

    <ChainEditor
      :nodes="def.nodes"
      :selected-node-id="uiStore.selectedNodeId"
      :trace="runStore.trace"
      :final-artifact-key="finalArtifactKey"
      :show-capsule-add="true"
      @select="uiStore.selectNode"
      @add="editor.addNode"
      @remove="editor.removeNode"
      @move-up="(id) => editor.moveNode(id, 'up')"
      @move-down="(id) => editor.moveNode(id, 'down')"
    />
  </div>
</template>

<script setup lang="ts">
import {ref, computed} from 'vue';
import type {PipelineDefinition} from '@lorca/core';
import {usePipelineEditor} from '../../composables/usePipelineEditor.js';
import {useActiveRunStore} from '../../stores/activeRun.js';
import {useUiStore} from '../../stores/ui.js';
import ChainEditor from './ChainEditor.vue';

const props = defineProps<{def: PipelineDefinition}>();
const emit = defineEmits<{update: [def: PipelineDefinition]}>();

const runStore = useActiveRunStore();
const uiStore = useUiStore();
const userPrompt = ref('');
const editor = usePipelineEditor(props.def);
const {def, finalArtifactKey} = editor;

const canRun = computed(() => userPrompt.value.trim().length > 0);

async function handleRun() {
  await runStore.run(def.value, userPrompt.value.trim());
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
.btn-cancel { background: #2d1a1a; border-color: #4d2222; color: #e07070; }
.btn-cancel:hover { background: #3d2222; }
.prompt-input { padding: 0.5rem 0.75rem; border-bottom: 1px solid #1e1e1e; flex-shrink: 0; display: flex; flex-direction: column; gap: 0.2rem; }
.prompt-input label { font-size: 0.72rem; color: #666; }
.prompt-input textarea { background: #111; border: 1px solid #2a2a2a; color: #e8e8e8; border-radius: 4px; padding: 6px 8px; font-size: 0.85rem; resize: vertical; font-family: inherit; }
.prompt-input textarea:focus { outline: none; border-color: #3a6080; }
</style>
