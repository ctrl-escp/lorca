<template>
  <Teleport to="body">
    <div v-if="open" class="dialog-backdrop" @click.self="$emit('close')">
      <div class="dialog-box" role="dialog" aria-modal="true">
        <div class="dialog-header">
          <span class="dialog-title">{{ title }}</span>
          <button class="btn-close" type="button" @click="$emit('close')">×</button>
        </div>
        <label v-if="showStepOutputOption" class="option-row" :class="{disabled: !hasStepOutputs}">
          <input
            type="checkbox"
            :checked="includeStepOutputs"
            :disabled="!hasStepOutputs"
            @change="handleStepOutputsChange"
          />
          <span>Include step outputs</span>
        </label>
        <pre class="json-view">{{ json }}</pre>
        <div class="dialog-actions">
          <button type="button" class="btn btn-secondary" @click="$emit('close')">Close</button>
          <button type="button" class="btn btn-copy" @click="handleCopy">{{ copyLabel }}</button>
          <button type="button" class="btn btn-download" @click="handleDownload">Download {{ filename }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import {ref} from 'vue';

const props = defineProps<{
  open: boolean;
  title: string;
  json: string;
  filename: string;
  showStepOutputOption?: boolean;
  includeStepOutputs?: boolean;
  hasStepOutputs?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  'update:includeStepOutputs': [value: boolean];
}>();

const copyLabel = ref('Copy to Clipboard');

async function handleCopy() {
  await navigator.clipboard.writeText(props.json);
  copyLabel.value = 'Copied!';
  setTimeout(() => { copyLabel.value = 'Copy to Clipboard'; }, 1500);
}

function handleDownload() {
  const blob = new Blob([props.json], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = props.filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function handleStepOutputsChange(event: Event) {
  emit('update:includeStepOutputs', (event.target as HTMLInputElement).checked);
}
</script>

<style scoped>
.dialog-backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,0.6);
  display: flex; align-items: center; justify-content: center; z-index: 9999;
}
.dialog-box {
  background: #141414; border: 1px solid #2a2a2a; border-radius: 6px;
  padding: 1.25rem 1.5rem; width: 640px; max-width: 90vw;
  display: flex; flex-direction: column; gap: 0.75rem;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
}
.dialog-header {
  display: flex; align-items: center; justify-content: space-between;
}
.dialog-title { font-size: 0.9rem; font-weight: 600; color: #e8e8e8; }
.option-row {
  display: flex; align-items: center; gap: 0.45rem;
  font-size: 0.78rem; color: #bbb; user-select: none;
}
.option-row input { cursor: pointer; }
.option-row.disabled { color: var(--text-label); }
.option-row.disabled input { cursor: default; }
.btn-close {
  background: none; border: none; color: var(--text-label); font-size: 1.2rem;
  cursor: pointer; padding: 0 2px; line-height: 1;
}
.btn-close:hover { color: #aaa; }
.json-view {
  background: #0d0d0d; border: 1px solid #222; border-radius: 4px;
  padding: 0.75rem; margin: 0; font-size: 0.75rem; color: #a8d8a8;
  max-height: 50vh; overflow-y: auto; overflow-x: auto;
  white-space: pre; font-family: 'Menlo', 'Monaco', 'Consolas', monospace;
}
.dialog-actions {
  display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.25rem;
}
.btn {
  border-radius: 4px; padding: 5px 14px; font-size: 0.82rem;
  cursor: pointer; border: 1px solid #333;
}
.btn-secondary { background: #1a1a1a; color: #aaa; }
.btn-secondary:hover { background: #222; color: #ccc; }
.btn-copy { background: #1e2d1e; border-color: #2a4d2a; color: #5ddb9e; }
.btn-copy:hover { background: #253d25; }
.btn-download { background: #1e3d52; border-color: #2a5070; color: #7ec8e3; }
.btn-download:hover { background: #254a62; }
</style>
