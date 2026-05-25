<template>
  <div class="inspector-config-tab">
    <div class="ns-row">
      <span class="ns-label hdr-config" title="Artifact namespace for this step's outputs">namespace</span>
      <code class="ns-value">{{ effectiveStep.outputNamespace }}</code>
      <span class="ns-dot">·</span>
      <code class="ns-value">{{ effectiveStep.primaryOutputName }}</code>
    </div>

    <CapsuleInlineStepEditor
      v-if="inlineCapsuleScope"
      :capsule-step-id="inlineCapsuleScope.capsuleStepId"
      :inner-step="inlineCapsuleScope.innerStep"
    />

    <ModelCallConfigPanel
      v-else-if="effectiveStep.config.type === 'model-call'"
      :step="effectiveStep"
      @begin-edit="emit('begin-edit')"
      @commit-config="(config, label) => emit('commit-config', config, label)"
    />

    <template v-else-if="effectiveStep.config.type === 'presentation'">
      <div class="inspector-field">
        <FieldLabel label="Text" title="Free-form text with optional {{artifact.key}} interpolation" />
        <TextEditor
          :model-value="localTemplate"
          :rows="6"
          :artifact-refs="templateArtifactRefs"
          placeholder="{{artifact.user_prompt.raw}}"
          title="Text with optional artifact placeholders"
          @focus="emit('begin-edit')"
          @update:model-value="emit('update:template', $event)"
          @blur="emit('commit-template')"
        />
      </div>
    </template>

    <PipelineCapsuleInstanceEditor
      v-else-if="capsuleInstanceStep"
      :step="capsuleInstanceStep"
    />

    <template v-else-if="effectiveStep.config.type === 'loop-group'">
      <div class="inspector-field">
        <FieldLabel label="Max iterations" required title="Maximum number of times the inner chain will run" />
        <input
          type="number" min="1" max="20" step="1"
          :value="localMaxIterations"
          title="Maximum iterations"
          @input="emit('update:maxIterations', Number(($event.target as HTMLInputElement).value))"
          @blur="emit('commit-loop')"
        />
      </div>
      <LoopExitConditionEditor
        :exit-condition="effectiveStep.config.exitCondition"
        @update="emit('loop-exit-update', $event)"
      />
      <LoopInnerChainEditor
        :loop-step-id="effectiveStep.id"
        :inner-steps="effectiveStep.config.steps"
      />
    </template>
  </div>
</template>
<script setup lang="ts">
import type {LoopExitCondition, PipelineStep, CapsuleInstanceStepConfig} from '@lorca/core';
import {FieldLabel} from '@lorca/ui-kit';
import TextEditor from '../shared/TextEditor.vue';
import CapsuleInlineStepEditor from './CapsuleInlineStepEditor.vue';
import ModelCallConfigPanel from './ModelCallConfigPanel.vue';
import PipelineCapsuleInstanceEditor from './PipelineCapsuleInstanceEditor.vue';
import LoopExitConditionEditor from './LoopExitConditionEditor.vue';
import LoopInnerChainEditor from './LoopInnerChainEditor.vue';
import type {InlineCapsuleRunScope} from '../../utils/inlineCapsuleRun.js';

defineProps<{
  effectiveStep: PipelineStep;
  inlineCapsuleScope: InlineCapsuleRunScope | null;
  capsuleInstanceStep: (PipelineStep & {config: CapsuleInstanceStepConfig}) | null;
  templateArtifactRefs: string[];
  localTemplate: string;
  localMaxIterations: number;
}>();

const emit = defineEmits<{
  'begin-edit': [];
  'commit-config': [config: PipelineStep['config'], label: string];
  'update:template': [value: string];
  'commit-template': [];
  'update:maxIterations': [value: number];
  'commit-loop': [];
  'loop-exit-update': [exit: LoopExitCondition];
}>();
</script>
<style scoped>
.inspector-config-tab {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}
.ns-row { display: flex; align-items: center; gap: 0.35rem; font-size: 0.75rem; }
.ns-label { font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; font-size: 0.72rem; }
.ns-value { color: #5a8a5a; font-size: 0.75rem; }
.ns-dot { color: #333; }
.inspector-field { display: flex; flex-direction: column; gap: 0.25rem; }
input {
  background: #111; border: 1px solid #2a2a2a; color: #e8e8e8;
  border-radius: 5px; padding: 6px 10px; font-size: 0.88rem; width: 100%;
}
input:focus { outline: none; border-color: var(--accent-border); }
</style>
