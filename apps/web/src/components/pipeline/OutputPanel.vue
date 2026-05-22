<template>
  <div class="output-panel">
    <div v-if="status === 'idle'" class="output-idle">Run the pipeline to see output.</div>
    <div v-else-if="status === 'running'" class="output-running">Running…</div>
    <div v-else-if="error" class="output-error">
      <div class="error-code">{{ error.code }}</div>
      <div class="error-msg">{{ error.message }}</div>
      <div v-if="error.nodeId" class="error-node">Node: {{ error.nodeId }}</div>
    </div>
    <template v-else-if="output">
      <div v-if="outputStale" class="output-stale-banner">
        Stale — from the last run. Upstream config or inputs changed; re-run to refresh.
      </div>
      <div v-if="partialRun" class="output-partial-banner">
        Partial run — this is not necessarily the pipeline's configured final output.
      </div>
      <div class="output-value" :class="{stale: outputStale}">
        <div class="output-header">
          <span class="output-state-label" :class="outputStale ? 'stale' : 'current'">
            {{ outputStale ? 'Last run output (stale)' : 'Current output' }}
          </span>
          <span v-if="outputKey" class="output-key">{{ outputKey }}</span>
        </div>
        <JsonViewer :value="output.value" />
      </div>
    </template>
    <div v-else class="output-idle">No output.</div>
  </div>
</template>

<script setup lang="ts">
import type {PipelineArtifact, PipelineError} from '@lorca/core';
import {JsonViewer} from '@lorca/ui-kit';

defineProps<{
  status: string;
  output: PipelineArtifact | null;
  outputKey: string | null;
  error: PipelineError | null;
  outputStale?: boolean;
  partialRun?: boolean;
}>();
</script>

<style scoped>
.output-panel { padding: 0.75rem; height: 100%; overflow-y: auto; display: flex; flex-direction: column; gap: 0.4rem; }
.output-stale-banner {
  font-size: 0.72rem; color: #c8a050; background: #1a180f; border: 1px solid #4a4020;
  border-radius: 4px; padding: 0.4rem 0.55rem;
}
.output-partial-banner {
  font-size: 0.72rem; color: #8080c0; background: #101018; border: 1px solid #303050;
  border-radius: 4px; padding: 0.4rem 0.55rem;
}
.output-idle, .output-running { color: #444; font-size: 0.78rem; }
.output-running { color: #e8a020; }
.output-error { display: flex; flex-direction: column; gap: 0.3rem; }
.error-code { color: #e07070; font-family: monospace; font-size: 0.8rem; }
.error-msg { color: #c88; font-size: 0.82rem; }
.error-node { color: #666; font-size: 0.75rem; }
.output-value { display: flex; flex-direction: column; gap: 0.4rem; }
.output-value.stale :deep(.json-viewer) { opacity: 0.85; }
.output-value.stale :deep(.jv-raw),
.output-value.stale :deep(.jv-pretty) { border-color: #4a4020; }
.output-header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.35rem 0.6rem; }
.output-state-label { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
.output-state-label.current { color: #5a9d6e; }
.output-state-label.stale { color: #c8a050; }
.output-key { font-family: monospace; font-size: 0.72rem; color: #7ec8e3; }
</style>
