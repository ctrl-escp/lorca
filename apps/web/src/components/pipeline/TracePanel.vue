<template>
  <div class="trace-panel">
    <div v-if="trace.length === 0" class="trace-empty">No trace yet. Execute the pipeline to see step details.</div>
    <div v-for="event in trace" :key="`${event.nodeId}-${event.status}-${event.timestamp}`" class="trace-event" :class="`ev-${event.status}`">
      <div class="ev-header">
        <span class="ev-node">{{ event.nodeId }}</span>
        <span class="ev-status">{{ event.status }}</span>
        <span v-if="event.durationMs !== undefined" class="ev-duration">{{ event.durationMs }}ms</span>
      </div>
      <div v-if="event.outputArtifactNames?.length" class="ev-artifacts">
        <span v-for="name in event.outputArtifactNames" :key="name" class="artifact-tag">{{ name }}</span>
      </div>
      <div v-if="event.error" class="ev-error">
        <span class="ev-error-code">{{ event.error.code }}</span>
        <span class="ev-error-msg">{{ event.error.message }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type {PipelineTraceEvent} from '@lorca/core';
defineProps<{trace: PipelineTraceEvent[]}>();
</script>

<style scoped>
.trace-panel { padding: 0.75rem; display: flex; flex-direction: column; gap: 0.4rem; overflow-y: auto; height: 100%; }
.trace-empty { color: #444; font-size: 0.78rem; }
.trace-event { background: #111; border: 1px solid #1e1e1e; border-radius: 4px; padding: 0.4rem 0.6rem; }
.ev-completed { border-left: 2px solid #3a9d6e; }
.ev-failed { border-left: 2px solid #c0392b; }
.ev-started { border-left: 2px solid #e8a020; }
.ev-skipped, .ev-cancelled { opacity: 0.5; }
.ev-header { display: flex; gap: 0.5rem; align-items: center; font-size: 0.78rem; }
.ev-node { font-family: monospace; color: #7ec8e3; }
.ev-status { color: #888; }
.ev-duration { color: #555; font-size: 0.72rem; margin-left: auto; }
.ev-artifacts { display: flex; flex-wrap: wrap; gap: 0.25rem; margin-top: 0.25rem; }
.artifact-tag { background: #1e1e1e; border: 1px solid #2a2a2a; border-radius: 3px; padding: 1px 5px; font-size: 0.68rem; color: #888; font-family: monospace; }
.ev-error { margin-top: 0.25rem; font-size: 0.75rem; }
.ev-error-code { color: #e07070; margin-right: 0.4rem; font-family: monospace; }
.ev-error-msg { color: #c88; }
</style>
