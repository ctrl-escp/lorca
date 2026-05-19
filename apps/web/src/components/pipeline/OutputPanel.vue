<template>
  <div class="output-panel">
    <div v-if="status === 'idle'" class="output-idle">Run the pipeline to see output.</div>
    <div v-else-if="status === 'running'" class="output-running">Running…</div>
    <div v-else-if="error" class="output-error">
      <div class="error-code">{{ error.code }}</div>
      <div class="error-msg">{{ error.message }}</div>
      <div v-if="error.nodeId" class="error-node">Node: {{ error.nodeId }}</div>
    </div>
    <div v-else-if="output" class="output-value">
      <div class="output-key">{{ outputKey }}</div>
      <pre class="output-text">{{ displayValue }}</pre>
    </div>
    <div v-else class="output-idle">No output.</div>
  </div>
</template>

<script setup lang="ts">
import {computed} from 'vue';
import type {PipelineArtifact, PipelineError} from '@lorca/core';

const props = defineProps<{
  status: string;
  output: PipelineArtifact | null;
  outputKey: string | null;
  error: PipelineError | null;
}>();

const displayValue = computed(() => {
  if (!props.output) return '';
  if (typeof props.output.value === 'string') return props.output.value;
  return JSON.stringify(props.output.value, null, 2);
});
</script>

<style scoped>
.output-panel { padding: 0.75rem; height: 100%; overflow-y: auto; }
.output-idle, .output-running { color: #444; font-size: 0.78rem; }
.output-running { color: #e8a020; }
.output-error { display: flex; flex-direction: column; gap: 0.3rem; }
.error-code { color: #e07070; font-family: monospace; font-size: 0.8rem; }
.error-msg { color: #c88; font-size: 0.82rem; }
.error-node { color: #666; font-size: 0.75rem; }
.output-value { display: flex; flex-direction: column; gap: 0.4rem; }
.output-key { font-family: monospace; font-size: 0.72rem; color: #7ec8e3; }
.output-text { margin: 0; white-space: pre-wrap; word-break: break-word; font-size: 0.85rem; color: #ddd; background: #111; border: 1px solid #222; border-radius: 4px; padding: 0.6rem; }
</style>
