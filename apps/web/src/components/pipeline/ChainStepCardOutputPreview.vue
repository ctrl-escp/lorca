<template>
  <div v-if="preview !== null" class="step-output-preview-wrap">
    <button
      type="button"
      class="step-output-preview-header"
      :aria-expanded="!collapsed"
      :title="collapsed ? 'Expand output preview' : 'Collapse output preview'"
      @click.stop="emit('toggle')"
    >
      <span class="step-output-toggle-indicator">{{ collapsed ? '+' : '-' }}</span>
      <span class="step-output-preview-label hdr-output">Output preview</span>
    </button>
    <JsonViewer
      v-if="!collapsed"
      class="step-output-preview"
      :value="preview"
      :show-header="false"
    />
  </div>
</template>
<script setup lang="ts">
import {JsonViewer} from '@lorca/ui-kit';

defineProps<{
  preview: unknown;
  collapsed: boolean;
}>();

const emit = defineEmits<{
  toggle: [];
}>();
</script>
<style scoped>
.step-output-preview-wrap {
  max-width: 100%;
  min-width: 0;
  background: #0d0d0d;
  border-radius: 5px;
  border: 1px solid #242424;
  overflow: hidden;
}
:global(.chain-step.output-expanded) .step-output-preview-wrap {
  min-height: 0;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
}
.step-output-preview-header {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0.55rem;
  background: transparent;
  border-bottom: 1px solid #202020;
  border-left: 0;
  border-right: 0;
  border-top: 0;
  cursor: pointer;
  text-align: left;
}
.step-output-preview-header:hover { background: #121212; }
.step-output-toggle-indicator {
  width: 1ch;
  color: var(--text-label);
  font-family: monospace;
  font-size: clamp(0.86rem, 1.7cqh, 1.1rem);
  font-weight: 700;
}
.step-output-preview-label {
  flex: 1;
  font-size: clamp(0.68rem, 1.35cqh, 0.9rem);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.step-output-preview-header:hover .step-output-preview-label,
.step-output-preview-header:hover .step-output-toggle-indicator { color: #ccc; }
.step-output-preview {
  flex: 1 1 auto;
  min-height: 0;
  margin: 0;
  overflow: auto;
  overscroll-behavior: contain;
}
.step-output-preview :deep(.jv-raw),
.step-output-preview :deep(.jv-pretty) {
  border: 0;
  border-radius: 0;
  background: transparent;
  padding: 0.65rem 0.75rem;
  font-size: clamp(0.9rem, 1.8cqh, 1.15rem);
  color: var(--text-label);
  max-height: none;
}
</style>
