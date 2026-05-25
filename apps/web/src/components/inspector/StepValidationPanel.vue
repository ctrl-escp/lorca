<template>
  <div v-if="stepStatus?.blockReasons?.length" class="inspector-status status-blocked">
    <ul class="inspector-status-issues">
      <li v-for="(reason, i) in stepStatus.blockReasons" :key="i">{{ reason }}</li>
    </ul>
  </div>
  <p v-else-if="stepStatus?.state === 'stale' || stepStatus?.state === 'failed-stale'" class="inspector-status-hint">
    Upstream config or inputs changed since the last run. Re-run to refresh outputs.
  </p>
  <p v-else-if="stepStatus?.state === 'current' || stepStatus?.state === 'failed-current'" class="inspector-status-hint ok">
    No blocking issues for this step.
  </p>
  <p v-else class="empty-hint">Run the pipeline to evaluate validation state.</p>
</template>

<script setup lang="ts">
import type {StepStaleState} from '@lorca/pipeline';

defineProps<{
  stepStatus: StepStaleState | null;
}>();
</script>

<style scoped>
.inspector-status {
  border: 1px solid #2a2a2a; border-radius: 5px; padding: 0.55rem 0.7rem;
  display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.82rem;
}
.status-blocked { border-left: 2px solid #c0392b; background: #1a0f0f; }
.inspector-status-issues { margin: 0; padding-left: 1rem; color: #e07070; }
.inspector-status-hint { margin: 0; color: var(--text-label); font-size: 0.78rem; }
.inspector-status-hint.ok { color: #5a9d6e; }
.empty-hint { font-size: 0.78rem; color: var(--text-label); margin: 0; }
</style>
