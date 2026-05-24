<template>
  <div class="pipeline-selector" ref="rootRef">
    <!-- Active pipeline name button (opens dropdown) -->
    <button
      type="button"
      class="selector-trigger"
      :title="`Active pipeline: ${activeName} — click to switch`"
      @click="open = !open"
    >
      <span class="selector-name">{{ activeName }}</span>
      <span class="selector-chevron" :class="{open}">›</span>
    </button>

    <!-- Dropdown listbox -->
    <div v-if="open" class="selector-dropdown" role="listbox" :aria-label="`Select pipeline`">
      <div
        v-for="pipeline in pipelines"
        :key="pipeline.id"
        class="selector-option"
        :class="{active: pipeline.id === activeId}"
        role="option"
        :aria-selected="pipeline.id === activeId"
        @click="selectPipeline(pipeline.id)"
      >
        <span class="option-name">{{ pipeline.name || '(unnamed)' }}</span>
        <button
          type="button"
          class="option-delete"
          title="Delete this pipeline"
          @click.stop="requestDelete(pipeline.id, pipeline.name)"
        >×</button>
      </div>
    </div>
  </div>

  <!-- Delete confirmation -->
  <ConfirmDialog
    :open="deleteConfirm.open"
    title="Delete Pipeline"
    :message="deleteConfirm.message"
    confirm-label="Delete"
    :destructive="true"
    @confirm="confirmDelete"
    @cancel="cancelDelete"
  />
</template>

<script setup lang="ts">
import {ref, computed, onMounted, onUnmounted} from 'vue';
import type {PipelineDefinition} from '@lorca/core';
import {ConfirmDialog} from '@lorca/ui-kit';

const props = defineProps<{
  pipelines: PipelineDefinition[];
  activeId: string | null;
}>();

const emit = defineEmits<{
  select: [id: string];
  delete: [id: string];
  'request-remount': [];
}>();

const open = ref(false);
const rootRef = ref<HTMLElement | null>(null);

const activeName = computed(() => {
  const p = props.pipelines.find((pl) => pl.id === props.activeId);
  return p?.name || 'Pipeline';
});

function selectPipeline(id: string) {
  open.value = false;
  if (id !== props.activeId) {
    emit('select', id);
    emit('request-remount');
  }
}

// Delete flow
const deleteConfirm = ref({open: false, message: '', targetId: ''});

function requestDelete(id: string, name: string) {
  open.value = false;
  deleteConfirm.value = {
    open: true,
    message: `Delete "${name || 'this pipeline'}"? This cannot be undone.`,
    targetId: id,
  };
}

function confirmDelete() {
  const id = deleteConfirm.value.targetId;
  deleteConfirm.value = {open: false, message: '', targetId: ''};
  emit('delete', id);
  emit('request-remount');
}

function cancelDelete() {
  deleteConfirm.value = {open: false, message: '', targetId: ''};
}

// Close on outside click
function onDocClick(e: MouseEvent) {
  if (open.value && rootRef.value && !rootRef.value.contains(e.target as Node)) {
    open.value = false;
  }
}

onMounted(() => document.addEventListener('click', onDocClick, true));
onUnmounted(() => document.removeEventListener('click', onDocClick, true));
</script>

<style scoped>
.pipeline-selector { position: relative; }

.selector-trigger {
  display: flex; align-items: center; gap: 0.3rem;
  background: transparent; border: none; border-bottom: 1px solid transparent;
  color: #e8e8e8; font-size: 0.88rem; font-weight: 500;
  cursor: pointer; padding: 2px 0; max-width: 200px;
}
.selector-trigger:hover { border-bottom-color: #3a6080; }
.selector-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.selector-chevron { font-size: 0.85rem; color: var(--text-secondary); transition: transform 0.15s; flex-shrink: 0; }
.selector-chevron.open { transform: rotate(90deg); color: #7ec8e3; }

.selector-dropdown {
  position: absolute; top: calc(100% + 4px); left: 0; z-index: 300;
  background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 4px;
  min-width: 200px; max-width: 280px; max-height: 240px; overflow-y: auto;
  box-shadow: 0 4px 16px rgba(0,0,0,0.4);
}

.selector-option {
  display: flex; align-items: center; gap: 0.35rem;
  padding: 6px 10px; cursor: pointer; font-size: 0.82rem;
}
.selector-option:hover { background: #222; }
.selector-option.active { background: #1e2d3d; color: #7ec8e3; }

.option-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.option-delete {
  flex-shrink: 0; background: none; border: none; color: var(--text-secondary);
  cursor: pointer; font-size: 1rem; padding: 0 2px; line-height: 1;
}
.option-delete:hover { color: #e07070; }
</style>
