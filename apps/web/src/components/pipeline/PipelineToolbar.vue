<template>
  <div class="center-toolbar">
    <button class="btn btn-secondary btn-new" type="button" title="Start a new empty pipeline" @click="$emit('new')">New</button>
    <PipelineSelector
      v-if="pipelines.length > 1"
      :pipelines="pipelines"
      :active-id="activePipelineId"
      @select="$emit('pipeline-select', $event)"
      @delete="$emit('pipeline-delete', $event)"
      @clear-all="$emit('clear-all-pipelines')"
    />
    <input
      v-else
      class="pipeline-name"
      :value="pipelineName"
      placeholder="Pipeline name"
      @input="$emit('update:pipelineName', ($event.target as HTMLInputElement).value)"
      @blur="$emit('commit-pipeline-name')"
      @keydown.enter="$emit('commit-pipeline-name')"
    />
    <div class="run-controls" :class="{ 'is-running': isRunning }">
      <div class="pipeline-action-controls">
        <button class="btn btn-secondary" type="button" title="Generate a pipeline from a natural-language description" @click="$emit('build-from-description')">✨ Build from description…</button>
        <button class="btn btn-secondary ovf-inline ovf-1" type="button" title="Wrap selected steps in a retry loop (refine → verify)" @click="$emit('wrap-retry-loop')">Wrap in retry loop</button>
        <button class="btn btn-secondary ovf-inline ovf-2" type="button" title="Lock selected steps, or the whole pipeline, as a Capsule" @click="$emit('lock-as-capsule')">Lock as Capsule</button>
        <button class="btn btn-secondary ovf-inline ovf-3" type="button" @click="$emit('export')">Export</button>
        <button class="btn btn-secondary ovf-inline ovf-4" type="button" @click="$emit('import')">Import</button>
        <div class="more-menu-wrap" ref="moreMenuRef">
          <button class="btn btn-secondary" type="button" @click="moreMenuOpen = !moreMenuOpen">⋯ More</button>
          <div v-if="moreMenuOpen" class="more-menu-dropdown">
            <button class="more-menu-item ovf-drop ovf-drop-1" type="button" @click="emitAndClose('wrap-retry-loop')">Wrap in retry loop</button>
            <button class="more-menu-item ovf-drop ovf-drop-2" type="button" @click="emitAndClose('lock-as-capsule')">Lock as Capsule</button>
            <button class="more-menu-item ovf-drop ovf-drop-3" type="button" @click="emitAndClose('export')">Export</button>
            <button class="more-menu-item ovf-drop ovf-drop-4" type="button" @click="emitAndClose('import')">Import</button>
            <button class="more-menu-item" type="button" @click="emitAndClose('clear-all-pipelines')">Clear all pipelines…</button>
          </div>
        </div>
      </div>
      <div class="execute-controls">
        <label v-if="isRunning" class="follow-run-label" title="Auto-scroll step selection to the running step">
          <input type="checkbox" :checked="followRunLive" @change="$emit('update:followRunLive', ($event.target as HTMLInputElement).checked)" />
          <span class="follow-run-text">Follow</span>
        </label>
        <button
          class="btn btn-run"
          :disabled="isRunning || !canRun"
          :title="runButtonTitle"
          @click="$emit('run')"
        >
          {{ isRunning ? 'Running…' : 'Execute Pipeline' }}
        </button>
        <button class="btn btn-cancel" v-if="isRunning" @click="$emit('cancel')">Cancel</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {ref, onMounted, onUnmounted} from 'vue';
import type {PipelineDefinition} from '@lorca/core';
import PipelineSelector from './PipelineSelector.vue';

defineProps<{
  pipelines: PipelineDefinition[];
  activePipelineId: string | null;
  pipelineName: string;
  isRunning: boolean;
  canRun: boolean;
  runButtonTitle: string;
  followRunLive: boolean;
}>();

const emit = defineEmits<{
  new: [];
  'pipeline-select': [id: string];
  'pipeline-delete': [id: string];
  'clear-all-pipelines': [];
  'update:pipelineName': [name: string];
  'commit-pipeline-name': [];
  'build-from-description': [];
  'wrap-retry-loop': [];
  'lock-as-capsule': [];
  export: [];
  import: [];
  run: [];
  cancel: [];
  'update:followRunLive': [value: boolean];
}>();

const moreMenuOpen = ref(false);
const moreMenuRef = ref<HTMLElement | null>(null);

function emitAndClose(event: 'wrap-retry-loop' | 'lock-as-capsule' | 'export' | 'import' | 'clear-all-pipelines') {
  moreMenuOpen.value = false;
  switch (event) {
    case 'wrap-retry-loop': emit('wrap-retry-loop'); break;
    case 'lock-as-capsule': emit('lock-as-capsule'); break;
    case 'export': emit('export'); break;
    case 'import': emit('import'); break;
    case 'clear-all-pipelines': emit('clear-all-pipelines'); break;
  }
}

function onDocClick(e: MouseEvent) {
  if (moreMenuOpen.value && moreMenuRef.value && !moreMenuRef.value.contains(e.target as Node)) {
    moreMenuOpen.value = false;
  }
}

onMounted(() => document.addEventListener('click', onDocClick, true));
onUnmounted(() => document.removeEventListener('click', onDocClick, true));
</script>

<style scoped>
.center-toolbar {
  display: flex; align-items: center; gap: 0.55rem; flex-wrap: wrap;
  padding: 0.65rem 1rem; border-bottom: 1px solid var(--border-divider); flex-shrink: 0;
}
.pipeline-name {
  flex: 1; background: transparent; border: none; color: #e8e8e8;
  font-size: 1rem; font-weight: 500; min-width: 0;
}
.pipeline-name:focus { outline: none; border-bottom: 1px solid var(--accent-border); }

.run-controls {
  display: flex; flex: 1 1 auto; gap: 0.4rem; align-items: center;
  justify-content: flex-end; flex-wrap: wrap; min-width: 0;
}
.pipeline-action-controls,
.execute-controls {
  display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap;
}
.execute-controls { flex-shrink: 0; }
.btn { border-radius: 5px; padding: 6px 14px; font-size: 0.85rem; cursor: pointer; border: 1px solid #333; }
.btn-run { background: var(--accent-bg); border-color: var(--accent-border); color: var(--accent); }
.btn-run:hover:not(:disabled) { background: var(--accent-bg-hover); }
.btn-run:disabled { opacity: 0.4; cursor: default; }
.btn-secondary { background: #1a1a1a; color: #aaa; }
.btn-secondary:hover { background: #222; color: #ccc; }
.btn-cancel { background: #2d1a1a; border-color: #4d2222; color: #e07070; }
.btn-cancel:hover { background: #3d2222; }
.follow-run-label {
  display: flex; align-items: center; gap: 0.35rem; font-size: 0.82rem;
  color: var(--text-label); cursor: pointer; user-select: none; flex-shrink: 0;
}
.follow-run-label input { cursor: pointer; }

.more-menu-wrap { position: relative; }
.ovf-inline { display: none; }

@container (min-width: 640px) {
  .ovf-1 { display: inline-flex; }
  .ovf-drop-1 { display: none; }
}
@container (min-width: 760px) {
  .ovf-2 { display: inline-flex; }
  .ovf-drop-2 { display: none; }
}
@container (min-width: 875px) {
  .ovf-3 { display: inline-flex; }
  .ovf-drop-3 { display: none; }
}
@container (min-width: 945px) {
  .ovf-4 { display: inline-flex; }
  .ovf-drop-4 { display: none; }
}
@container (min-width: 1010px) {
  .ovf-5 { display: inline-flex; }
  .ovf-drop-5 { display: none; }
  .more-menu-wrap { display: none; }
}

@container (min-width: 640px) and (max-width: 819px) {
  .run-controls.is-running .ovf-1 { display: none; }
  .run-controls.is-running .ovf-drop-1 { display: block; }
}
@container (min-width: 760px) and (max-width: 939px) {
  .run-controls.is-running .ovf-2 { display: none; }
  .run-controls.is-running .ovf-drop-2 { display: block; }
}
@container (min-width: 875px) and (max-width: 1054px) {
  .run-controls.is-running .ovf-3 { display: none; }
  .run-controls.is-running .ovf-drop-3 { display: block; }
}
@container (min-width: 945px) and (max-width: 1124px) {
  .run-controls.is-running .ovf-4 { display: none; }
  .run-controls.is-running .ovf-drop-4 { display: block; }
}
@container (min-width: 1010px) and (max-width: 1189px) {
  .run-controls.is-running .ovf-5 { display: none; }
  .run-controls.is-running .ovf-drop-5 { display: block; }
  .run-controls.is-running .more-menu-wrap { display: block; }
}

@container (max-width: 720px) {
  .follow-run-text { display: none; }
}
.more-menu-dropdown {
  position: absolute; top: calc(100% + 4px); left: 0; z-index: 200;
  background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 5px;
  display: flex; flex-direction: column; min-width: 190px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.4);
}
.more-menu-item {
  background: none; border: none; color: #aaa; text-align: left;
  padding: 9px 16px; font-size: 0.85rem; cursor: pointer;
}
.more-menu-item:hover { background: #242424; color: #ccc; }

@media (max-width: 767px) {
  .center-toolbar { padding: 0.55rem 0.75rem; gap: 0.4rem; }
  .run-controls { flex-wrap: wrap; }
}

@container (max-width: 620px) {
  .center-toolbar {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    padding: 0.55rem 0.7rem;
  }

  .run-controls {
    grid-column: 1 / -1;
    flex-wrap: wrap;
  }

  .btn {
    padding-inline: 10px;
  }
}
</style>
