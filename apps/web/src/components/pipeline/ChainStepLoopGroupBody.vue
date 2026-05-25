<template>
  <div class="loop-group-body">
    <div class="loop-group-banner" :title="loopExitSummary(step)">
      <span class="loop-group-icon">↺</span>
      <span>Up to {{ loopConfig.maxIterations }}×</span>
      <span class="loop-group-dot">·</span>
      <span class="loop-group-exit">{{ loopExitSummary(step) }}</span>
      <span
        v-if="executionChip"
        class="step-exec-chip step-exec-chip-compact"
        :class="`exec-${executionChip.phase}`"
        :title="executionChip.title"
      >
        <span
          v-if="executionChip.phase === 'running'"
          class="exec-spinner"
          aria-hidden="true"
        />
        {{ executionChip.label }}
      </span>
    </div>
    <div v-if="loopConfig.steps.length === 0" class="loop-inner-empty">
      Empty loop — add inner steps in the Inspector
    </div>
    <ol
      v-else
      class="loop-inner-list"
      :class="{'loop-inner-active-run': executionChip?.phase === 'running'}"
    >
      <li
        v-for="(inner, ii) in loopConfig.steps"
        :key="inner.id"
        class="loop-inner-item"
        :class="{
          'loop-inner-selected': selectedLoopInnerStepId === inner.id && selectedStepId === step.id,
          'loop-inner-last': ii === loopConfig.steps.length - 1,
          'loop-inner-active-run': executionChip?.phase === 'running',
        }"
        :title="ii === loopConfig.steps.length - 1 ? 'Last step — its JSON output controls loop exit' : 'Click to configure inner step'"
        @click.stop="emit('select-inner', inner.id)"
      >
        <span class="loop-inner-index">{{ ii + 1 }}</span>
        <span class="loop-inner-type">{{ stepTypeLabel(inner.type) }}</span>
        <span class="loop-inner-label">{{ inner.label }}</span>
        <span v-if="ii === loopConfig.steps.length - 1" class="loop-inner-exit-badge">exit check</span>
      </li>
    </ol>
    <p class="loop-prev-hint">On retry: <code>loop.prev.text</code> = previous iteration's verifier output</p>
  </div>
</template>
<script setup lang="ts">
import {computed} from 'vue';
import type {LoopGroupStepConfig, PipelineStep} from '@lorca/core';
import type {StepExecutionChip} from '../../utils/stepExecutionDisplay.js';
import {loopExitSummary} from '../../utils/chainStepDisplay.js';
import {stepTypeLabel} from '../../utils/stepTypeLabels.js';

const props = defineProps<{
  step: PipelineStep;
  executionChip: StepExecutionChip | null;
  selectedLoopInnerStepId?: string | null | undefined;
  selectedStepId: string | null;
}>();

const loopConfig = computed((): LoopGroupStepConfig => {
  if (props.step.config.type !== 'loop-group') {
    throw new Error('ChainStepLoopGroupBody requires a loop-group step');
  }
  return props.step.config;
});

const emit = defineEmits<{
  'select-inner': [innerStepId: string];
}>();
</script>
<style scoped>
.loop-group-body {
  margin: 0.45rem 0 0.2rem;
  padding: 0.55rem 0.65rem;
  background: #101418;
  border: 1px solid #2a3545;
  border-left: 3px solid #5a7aa8;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.loop-group-banner {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.35rem;
  font-size: clamp(0.72rem, 1.4cqh, 0.88rem);
  color: #8ab0d8;
}
.loop-group-icon { font-size: 1rem; color: var(--accent); }
.loop-group-dot { color: var(--text-muted); }
.loop-group-exit { color: #9ab8d0; font-family: monospace; font-size: 0.85em; }
.step-exec-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.12rem 0.5rem;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 600;
  flex-shrink: 0;
}
.step-exec-chip-compact { margin-left: auto; padding: 0.08rem 0.4rem; }
.exec-running { background: #3a2808; color: #f0b040; border: 1px solid #805010; }
.exec-completed { background: #1a2e1a; color: #5a9d5a; border: 1px solid #2a5a3a; }
.exec-failed { background: #2e1a1a; color: #e07070; border: 1px solid #7a3030; }
.exec-skipped, .exec-cancelled { background: #1a1a1a; color: var(--text-secondary); border: 1px solid #333; }
.exec-spinner {
  width: 0.65rem;
  height: 0.65rem;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: exec-spin 0.75s linear infinite;
}
@keyframes exec-spin { to { transform: rotate(360deg); } }
.loop-inner-empty { font-size: 0.78rem; color: var(--text-secondary); margin: 0; }
.loop-inner-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.loop-inner-item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.5rem;
  background: #0d1014;
  border: 1px solid #222830;
  border-radius: 4px;
  cursor: pointer;
  font-size: clamp(0.75rem, 1.45cqh, 0.92rem);
}
.loop-inner-item:hover { border-color: #3a5068; background: #121820; }
.loop-inner-selected { border-color: #4a7090; background: #152030; }
.loop-inner-active-run:not(.loop-inner-selected) {
  border-color: #805010;
  border-style: dashed;
  background: #1a1408;
}
.loop-inner-list.loop-inner-active-run {
  box-shadow: inset 0 0 0 1px rgba(232, 160, 32, 0.15);
  border-radius: 6px;
}
.loop-inner-index { color: var(--text-secondary); min-width: 1.1rem; font-family: monospace; }
.loop-inner-type {
  font-size: 0.62rem;
  padding: 1px 5px;
  background: var(--accent-bg-muted);
  color: var(--accent);
  border-radius: 2px;
  flex-shrink: 0;
}
.loop-inner-label { flex: 1; color: #ccc; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.loop-inner-exit-badge {
  font-size: 0.62rem;
  padding: 1px 5px;
  background: #1a2a1a;
  color: #8ab88a;
  border-radius: 2px;
  flex-shrink: 0;
}
.loop-prev-hint { margin: 0; font-size: 0.68rem; color: var(--text-secondary); }
.loop-prev-hint code { color: #6a8ab0; font-size: 0.65rem; }
</style>
