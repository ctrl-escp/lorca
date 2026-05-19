<template>
  <div class="trace-panel">
    <div v-if="partialRun" class="trace-run-banner partial">Partial run — only steps up to the selected target executed.</div>
    <div v-else-if="trace.length > 0" class="trace-run-banner full">Full pipeline run</div>

    <div v-if="selectedStepId && filterToSelected" class="trace-filter-note">
      Showing events for selected step
      <button type="button" class="trace-filter-clear" @click="filterToSelected = false">Show all</button>
    </div>

    <div v-if="displayTrace.length === 0" class="trace-empty">No trace yet. Execute Pipeline to see step details.</div>
    <div v-for="event in displayTrace" :key="`${event.nodeId}-${event.status}-${event.timestamp}`" class="trace-event" :class="`ev-${event.status}`">
      <div class="ev-header">
        <span v-if="event.capsuleInstanceId" class="ev-capsule-id">{{ event.capsuleInstanceId }}<template v-if="event.capsuleIteration !== undefined"> #{{ event.capsuleIteration }}</template></span>
        <span class="ev-node" :class="{'ev-node-internal': !!event.capsuleInstanceId}">{{ event.nodeId }}</span>
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
import {ref, computed, watch} from 'vue';
import type {PipelineTraceEvent} from '@lorca/core';

const props = defineProps<{
  trace: PipelineTraceEvent[];
  partialRun?: boolean;
  selectedStepId?: string | null;
}>();

const filterToSelected = ref(false);

watch(() => props.selectedStepId, (id) => {
  filterToSelected.value = Boolean(id);
});

const displayTrace = computed(() => {
  if (!filterToSelected.value || !props.selectedStepId) return props.trace;
  const id = props.selectedStepId;
  return props.trace.filter(
    (e) => e.nodeId === id || e.stepId === id,
  );
});
</script>

<style scoped>
.trace-panel { padding: 0.75rem; display: flex; flex-direction: column; gap: 0.4rem; overflow-y: auto; height: 100%; }
.trace-run-banner {
  font-size: 0.65rem; padding: 0.3rem 0.5rem; border-radius: 3px; text-transform: uppercase;
  letter-spacing: 0.04em;
}
.trace-run-banner.full { background: #1a2a1a; color: #5a9d5a; }
.trace-run-banner.partial { background: #1a1a2a; color: #8080c0; }
.trace-filter-note {
  font-size: 0.68rem; color: #666; display: flex; align-items: center; gap: 0.4rem;
}
.trace-filter-clear {
  background: none; border: none; color: #7ec8e3; cursor: pointer; font-size: 0.68rem; padding: 0;
}
.trace-filter-clear:hover { text-decoration: underline; }
.trace-empty { color: #444; font-size: 0.78rem; }
.trace-event { background: #111; border: 1px solid #1e1e1e; border-radius: 4px; padding: 0.4rem 0.6rem; }
.ev-completed { border-left: 2px solid #3a9d6e; }
.ev-failed { border-left: 2px solid #c0392b; }
.ev-started { border-left: 2px solid #e8a020; }
.ev-skipped, .ev-cancelled { opacity: 0.5; }
.ev-header { display: flex; gap: 0.5rem; align-items: center; font-size: 0.78rem; flex-wrap: wrap; }
.ev-capsule-id { font-family: monospace; color: #5a9fd4; font-size: 0.68rem; }
.ev-capsule-id::after { content: ' ›'; }
.ev-node { font-family: monospace; color: #7ec8e3; }
.ev-node-internal { color: #4a8db4; font-size: 0.72rem; }
.ev-status { color: #888; }
.ev-duration { color: #555; font-size: 0.72rem; margin-left: auto; }
.ev-artifacts { display: flex; flex-wrap: wrap; gap: 0.25rem; margin-top: 0.25rem; }
.artifact-tag { background: #1e1e1e; border: 1px solid #2a2a2a; border-radius: 3px; padding: 1px 5px; font-size: 0.68rem; color: #888; font-family: monospace; }
.ev-error { margin-top: 0.25rem; font-size: 0.75rem; }
.ev-error-code { color: #e07070; margin-right: 0.4rem; font-family: monospace; }
.ev-error-msg { color: #c88; }
</style>
