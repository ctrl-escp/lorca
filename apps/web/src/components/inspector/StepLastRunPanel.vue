<template>
  <div v-if="stepStatus" class="inspector-status" :class="`status-${stepStatus.state}`">
    <div class="inspector-status-header">
      <span class="inspector-status-label">{{ stepRunUiStateLabel(stepStatus.state) }}</span>
      <span v-if="lastSnapshot?.completedAt" class="inspector-status-time">{{ formatTime(lastSnapshot.completedAt) }}</span>
    </div>
    <JsonViewer
      v-if="lastRunOutputValue !== null"
      class="inspector-output-preview"
      :value="lastRunOutputValue"
    />
    <p v-else-if="stepStatus.state === 'not-run'" class="empty-hint">This step has not been executed yet.</p>
  </div>
  <p v-else class="empty-hint">No run data.</p>
</template>

<script setup lang="ts">
import type {StepRunSnapshot} from '@lorca/core';
import {stepRunUiStateLabel} from '@lorca/pipeline';
import type {StepStaleState} from '@lorca/pipeline';
import {JsonViewer} from '@lorca/ui-kit';

defineProps<{
  stepStatus: StepStaleState | null;
  lastSnapshot: StepRunSnapshot | null;
  lastRunOutputValue: unknown | null;
  formatTime: (iso: string) => string;
}>();
</script>

<style scoped>
.inspector-status {
  border: 1px solid #2a2a2a; border-radius: 5px; padding: 0.55rem 0.7rem;
  display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.82rem;
}
.status-current { border-left: 2px solid #3a9d6e; background: #0f1a0f; }
.status-stale, .status-failed-stale { border-left: 2px solid #c8a050; background: #1a180f; }
.status-blocked { border-left: 2px solid #c0392b; background: #1a0f0f; }
.status-not-run { border-left: 2px solid #444; background: #111; }
.status-failed-current { border-left: 2px solid #c0392b; background: #1a1010; }
.status-skipped-partial { border-left: 2px solid #606080; background: #101018; }
.status-disabled { opacity: 0.6; }
.inspector-status-header { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
.inspector-status-label { color: #aaa; font-weight: 500; }
.inspector-status-time { color: var(--text-secondary); font-size: 0.75rem; }
.inspector-output-preview {
  margin: 0.4rem 0 0;
  max-height: 12rem;
  overflow-y: auto;
}
.inspector-output-preview :deep(.jv-raw),
.inspector-output-preview :deep(.jv-pretty) {
  font-size: 0.78rem;
}
.empty-hint { font-size: 0.78rem; color: var(--text-label); margin: 0; }
</style>
