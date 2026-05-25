<template>
  <template v-if="showBottomSection">
    <div
      class="inspector-split-handle"
      :class="{draggable: splitMode === 'full'}"
      @mousedown="splitMode === 'full' ? emit('split-handle-mousedown', $event) : undefined"
    />
    <div
      class="inspector-bottom"
      :style="splitMode === 'full' ? {height: bottomHeight + 'px'} : {}"
    >
      <div
        v-if="splitMode === 'collapsed'"
        class="inspector-bottom-header"
        @click="emit('toggle-bottom-expanded')"
      >
        <span class="bottom-status-dot" :class="`dot-${stepStatus?.state ?? 'not-run'}`" />
        <span class="bottom-status-label">{{ stepStatus ? stepRunUiStateLabel(stepStatus.state) : 'No run data' }}</span>
        <span v-if="lastSnapshot?.completedAt" class="bottom-status-time">{{ formatTime(lastSnapshot.completedAt) }}</span>
        <span class="bottom-chevron">{{ isBottomExpanded ? '▾' : '▴' }}</span>
      </div>
      <div v-show="splitMode === 'full' || isBottomExpanded" class="inspector-bottom-content">
        <StepLastRunPanel
          :step-status="stepStatus"
          :last-snapshot="lastSnapshot"
          :last-run-output-value="lastRunOutputValue"
          :format-time="formatTime"
        />
      </div>
    </div>
  </template>
</template>
<script setup lang="ts">
import type {StepRunSnapshot} from '@lorca/core';
import {stepRunUiStateLabel, type StepStaleState} from '@lorca/pipeline';
import StepLastRunPanel from './StepLastRunPanel.vue';

defineProps<{
  showBottomSection: boolean;
  splitMode: 'full' | 'collapsed' | 'tabs';
  bottomHeight: number;
  isBottomExpanded: boolean;
  stepStatus: StepStaleState | null;
  lastSnapshot: StepRunSnapshot | null;
  lastRunOutputValue: unknown;
  formatTime: (iso: string) => string;
}>();

const emit = defineEmits<{
  'split-handle-mousedown': [event: MouseEvent];
  'toggle-bottom-expanded': [];
}>();
</script>
<style scoped>
.inspector-split-handle {
  flex-shrink: 0;
  height: 5px;
  margin: 0 -1rem;
  position: relative;
}
.inspector-split-handle::after {
  content: '';
  position: absolute;
  left: 0; right: 0;
  top: 2px;
  height: 1px;
  background: var(--border-divider);
  transition: background 0.15s, height 0.15s, top 0.15s;
}
.inspector-split-handle.draggable { cursor: row-resize; }
.inspector-split-handle.draggable:hover::after,
.inspector-split-handle.draggable:active::after {
  top: 1px;
  height: 3px;
  background: var(--accent-border);
}
.inspector-bottom {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.inspector-bottom-header {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.4rem 0;
  cursor: pointer;
  user-select: none;
  font-size: 0.82rem;
  flex-shrink: 0;
}
.inspector-bottom-header:hover { opacity: 0.85; }
.bottom-status-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.dot-current { background: #3a9d6e; }
.dot-stale, .dot-failed-stale { background: #c8a050; }
.dot-blocked, .dot-failed-current { background: #c0392b; }
.dot-not-run, .dot-skipped-partial { background: #444; }
.dot-disabled { background: #333; }
.bottom-status-label { color: #aaa; }
.bottom-status-time { color: var(--text-secondary); font-size: 0.75rem; margin-left: auto; }
.bottom-chevron { color: var(--text-secondary); font-size: 0.7rem; margin-left: 0.2rem; }
.inspector-bottom-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
</style>
