<template>
  <div class="capsule-inline-body">
    <div class="capsule-inline-banner">
      <span class="capsule-inline-icon hdr-capsule">Capsule</span>
      <span class="capsule-inline-title">{{ step.label }}</span>
      <span class="capsule-inline-version">{{ inlineConfig.capsuleVersion }}</span>
      <span v-if="inlineConfig.inlineModified" class="capsule-inline-modified-badge">modified</span>
      <div class="capsule-inline-actions">
        <button type="button" class="inline-action-btn" title="Fold inline steps back into a Capsule instance" @click.stop="emit('collapse')">Collapse</button>
        <button type="button" class="inline-action-btn" title="Save inline steps as a new Capsule" @click.stop="emit('lock')">Lock as Capsule</button>
        <button type="button" class="inline-action-btn" title="Convert back to an opaque Capsule reference" @click.stop="emit('detach')">Detach</button>
      </div>
    </div>
    <div v-if="!inlineConfig.inlineSteps?.length" class="capsule-inline-empty">
      No inline steps
    </div>
    <ol v-else class="capsule-inline-step-list">
      <li
        v-for="(inner, ii) in inlineConfig.inlineSteps"
        :key="inner.id"
        class="capsule-inline-step-item"
        :class="[
          {'capsule-inline-selected': selectedInlineInnerStepId === inner.id && selectedStepId === step.id},
          innerExecutionClass(inner.id),
        ]"
        title="Click to configure inline step"
        @click.stop="emit('select-inner', inner.id)"
      >
        <span class="loop-inner-index">{{ ii + 1 }}</span>
        <span class="loop-inner-type">{{ stepTypeLabel(inner.type) }}</span>
        <span class="capsule-inline-step-label">{{ inner.label }}</span>
        <span
          v-if="innerExecutionChipsByKey[chipKey(inner.id)]"
          class="step-exec-chip step-exec-chip-compact"
          :class="`exec-${innerExecutionChipsByKey[chipKey(inner.id)]!.phase}`"
          :title="innerExecutionChipsByKey[chipKey(inner.id)]!.title"
        >
          <span
            v-if="innerExecutionChipsByKey[chipKey(inner.id)]!.phase === 'running'"
            class="exec-spinner"
            aria-hidden="true"
          />
          {{ innerExecutionChipsByKey[chipKey(inner.id)]!.label }}
        </span>
      </li>
    </ol>
  </div>
</template>
<script setup lang="ts">
import {computed} from 'vue';
import type {CapsuleInstanceStepConfig, PipelineStep} from '@lorca/core';
import type {StepExecutionChip} from '../../utils/stepExecutionDisplay.js';
import {stepTypeLabel} from '../../utils/stepTypeLabels.js';

const props = defineProps<{
  step: PipelineStep;
  innerExecutionChipsByKey: Record<string, StepExecutionChip>;
  selectedInlineInnerStepId?: string | null | undefined;
  selectedStepId: string | null;
}>();

const emit = defineEmits<{
  collapse: [];
  lock: [];
  detach: [];
  'select-inner': [innerStepId: string];
}>();

const inlineConfig = computed((): CapsuleInstanceStepConfig => {
  const cfg = props.step.config;
  if (cfg.type !== 'capsule-instance' || cfg.displayMode !== 'inline') {
    throw new Error('ChainStepInlineCapsuleBody requires an inline capsule-instance step');
  }
  return cfg;
});

function chipKey(innerStepId: string): string {
  return `${props.step.id}:${innerStepId}`;
}

function innerExecutionClass(innerStepId: string): string {
  const chip = props.innerExecutionChipsByKey[chipKey(innerStepId)];
  if (!chip) return '';
  return `inner-exec-${chip.phase}`;
}
</script>
<style scoped>
.capsule-inline-body {
  margin: 0.45rem 0 0.2rem;
  padding: 0.55rem 0.65rem;
  background: var(--accent-bg-muted);
  border: 1px solid var(--border-divider);
  border-left: 3px solid var(--accent-border);
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.capsule-inline-banner {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem;
  color: var(--text-label);
  font-size: clamp(0.72rem, 1.4cqh, 0.88rem);
}
.capsule-inline-icon { font-size: 0.68rem; font-weight: 700; text-transform: uppercase; color: var(--accent); }
.capsule-inline-title { color: #ddd; }
.capsule-inline-version { color: var(--text-secondary); font-family: monospace; font-size: 0.85em; }
.capsule-inline-modified-badge {
  padding: 1px 6px;
  background: var(--accent-bg);
  color: var(--accent);
  border-radius: 3px;
  font-size: 0.64rem;
}
.capsule-inline-actions { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-left: auto; }
.capsule-inline-actions .inline-action-btn { grid-column: auto; min-width: 0; }
.capsule-inline-empty { font-size: 0.78rem; color: var(--text-secondary); margin: 0; }
.capsule-inline-step-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.capsule-inline-step-item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.5rem;
  background: #0e0f12;
  border: 1px solid #25262c;
  border-radius: 4px;
  cursor: pointer;
  font-size: clamp(0.75rem, 1.45cqh, 0.92rem);
}
.capsule-inline-step-item:hover { border-color: var(--accent-border); background: var(--accent-bg-muted); }
.capsule-inline-selected { border-color: var(--accent); background: var(--accent-bg); }
.inner-exec-running:not(.capsule-inline-selected) { border-color: #805010; background: #241a08; }
.inner-exec-completed:not(.capsule-inline-selected) { border-color: #2a5a3a; }
.inner-exec-failed:not(.capsule-inline-selected) { border-color: #7a3030; background: #2a1414; }
.capsule-inline-step-label { flex: 1; color: #ccc; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.loop-inner-index { color: var(--text-secondary); min-width: 1.1rem; font-family: monospace; }
.loop-inner-type {
  font-size: 0.62rem;
  padding: 1px 5px;
  background: var(--accent-bg-muted);
  color: var(--accent);
  border-radius: 2px;
  flex-shrink: 0;
}
.step-exec-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.08rem 0.4rem;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 600;
  margin-left: auto;
}
.exec-running { background: #3a2808; color: #f0b040; border: 1px solid #805010; }
.exec-completed { background: #1a2e1a; color: #5a9d5a; border: 1px solid #2a5a3a; }
.exec-failed { background: #2e1a1a; color: #e07070; border: 1px solid #7a3030; }
.exec-spinner {
  width: 0.65rem;
  height: 0.65rem;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: exec-spin 0.75s linear infinite;
}
@keyframes exec-spin { to { transform: rotate(360deg); } }
</style>
