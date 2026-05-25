<template>
  <p class="inputs-ref-semantics" :title="REORDER_REF_HINTS.history">
    Step inputs use two kinds of references:
    <strong>previous output</strong> follows chain order;
    <strong>history reads</strong>, template <code v-pre>{{artifact…}}</code> refs, and capsule bindings use artifact namespace strings and stay tied to the named step.
  </p>
  <template v-if="effectiveStep.config.type === 'capsule-instance' && !inlineCapsuleScope">
    <div class="binding-list">
      <div v-for="(ref, port) in effectiveStep.config.inputBindings" :key="port" class="binding-row">
        <span class="binding-port">{{ port }}</span>
        <span class="binding-arrow">←</span>
        <code class="binding-ref" :title="REORDER_REF_HINTS.binding">{{ ref }}</code>
      </div>
      <p v-if="Object.keys(effectiveStep.config.inputBindings).length === 0" class="empty-hint">No input bindings.</p>
    </div>
  </template>
  <template v-else-if="hasPromptBlocks && effectiveStep.prompt">
    <p v-if="effectiveStep.prompt.historyReads.length === 0 && !effectiveStep.prompt.previousOutput?.enabled" class="empty-hint">
      No history reads. Open the Prompt tab to add prior-step outputs.
    </p>
    <ul v-if="effectiveStep.prompt.historyReads.length > 0" class="history-read-list">
      <li
        v-for="(hr, i) in effectiveStep.prompt.historyReads"
        :key="`${hr.sourceStepId}-${i}`"
        class="history-read-row"
        :class="{invalid: !historyReadStatus(hr).ok}"
        :title="historyReadStatusTitle(hr)"
      >
        <code class="binding-ref">{{ hr.sourceArtifactRef }}</code>
        <span class="history-read-tag">&lt;{{ hr.tagName }}&gt;</span>
        <span v-if="hr.required" class="history-read-required">required</span>
        <span v-if="!historyReadStatus(hr).ok" class="history-read-issue">
          {{ historyReadStatus(hr).issues.map(historyReadIssueLabel).join(' · ') }}
        </span>
      </li>
    </ul>
    <p v-if="effectiveStep.prompt.previousOutput?.enabled" class="inputs-hint" :title="REORDER_REF_HINTS.previous">
      Previous output (<code>{{ effectiveStep.prompt.previousOutput.tagName }}</code>, {{ effectiveStep.prompt.previousOutput.placement }}):
      from <code>{{ previousOutputRef }}</code> — updates when you reorder steps.
    </p>
  </template>
  <p v-else class="empty-hint">No configurable inputs for this step type.</p>
</template>

<script setup lang="ts">
import type {PipelineStep, StepHistoryReadConfig} from '@lorca/core';
import {validateHistoryRead, historyReadIssueLabel, REORDER_REF_HINTS} from '@lorca/pipeline';

const props = defineProps<{
  effectiveStep: PipelineStep;
  inlineCapsuleScope: unknown;
  hasPromptBlocks: boolean;
  chainSteps: PipelineStep[];
  previousOutputRef: string;
}>();

function historyReadStatus(read: StepHistoryReadConfig) {
  return validateHistoryRead(read, props.effectiveStep.id, props.chainSteps);
}

function historyReadStatusTitle(read: StepHistoryReadConfig): string {
  const status = historyReadStatus(read);
  const base = `${read.sourceArtifactRef} → <${read.tagName}>. ${REORDER_REF_HINTS.history}`;
  if (status.ok) return base;
  return `${base} Issue: ${status.issues.map(historyReadIssueLabel).join(', ')}`;
}
</script>

<style scoped>
.binding-list { display: flex; flex-direction: column; gap: 0.25rem; }
.binding-row { display: flex; align-items: center; gap: 0.45rem; font-size: 0.82rem; }
.binding-port { color: var(--text-label); }
.binding-arrow { color: var(--text-muted); }
.binding-ref { color: #5a8a5a; font-size: 0.82rem; }
.history-read-list { margin: 0; padding-left: 1rem; display: flex; flex-direction: column; gap: 0.3rem; }
.history-read-row { font-size: 0.82rem; display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
.history-read-tag { color: var(--text-label); font-size: 0.75rem; }
.history-read-required { color: #c8a050; font-size: 0.75rem; }
.inputs-hint { font-size: 0.78rem; color: var(--text-label); margin: 0.4rem 0 0; }
.inputs-ref-semantics {
  font-size: 0.78rem; color: var(--text-label); margin: 0 0 0.5rem; line-height: 1.45;
}
.empty-hint { font-size: 0.78rem; color: var(--text-label); margin: 0; }
</style>
