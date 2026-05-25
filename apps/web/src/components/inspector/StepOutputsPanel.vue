<template>
  <div class="inspector-field">
    <FieldLabel label="Primary output key" />
    <code class="binding-ref">{{ scopedPrimaryOutputKey }}</code>
  </div>
  <div v-if="effectiveStep.config.type === 'capsule-instance' && !inlineCapsuleScope" class="binding-list">
    <div v-for="(ref, port) in effectiveStep.config.outputBindings" :key="port" class="binding-row">
      <span class="binding-port">{{ port }}</span>
      <span class="binding-arrow">→</span>
      <code class="binding-ref">{{ ref }}</code>
    </div>
  </div>
  <div v-if="lastSnapshot?.outputArtifactRefs.length" class="inspector-last-outputs">
    <span class="inspector-last-label">From last run:</span>
    <code v-for="ref in lastSnapshot.outputArtifactRefs" :key="ref" class="inspector-artifact-ref">{{ ref }}</code>
  </div>
  <p v-else class="empty-hint">No output artifacts from a run yet.</p>
</template>

<script setup lang="ts">
import type {PipelineStep, StepRunSnapshot} from '@lorca/core';
import {FieldLabel} from '@lorca/ui-kit';

defineProps<{
  effectiveStep: PipelineStep;
  inlineCapsuleScope: unknown;
  scopedPrimaryOutputKey: string;
  lastSnapshot: StepRunSnapshot | null;
}>();
</script>

<style scoped>
.inspector-field { display: flex; flex-direction: column; gap: 0.25rem; }
.binding-list { display: flex; flex-direction: column; gap: 0.25rem; }
.binding-row { display: flex; align-items: center; gap: 0.45rem; font-size: 0.82rem; }
.binding-port { color: var(--text-label); }
.binding-arrow { color: var(--text-muted); }
.binding-ref { color: #5a8a5a; font-size: 0.82rem; }
.inspector-last-outputs { display: flex; flex-wrap: wrap; gap: 0.3rem; align-items: center; }
.inspector-last-label { color: var(--text-secondary); font-size: 0.75rem; }
.inspector-artifact-ref { color: #5a8a5a; font-size: 0.75rem; }
.empty-hint { font-size: 0.78rem; color: var(--text-label); margin: 0; }
</style>
