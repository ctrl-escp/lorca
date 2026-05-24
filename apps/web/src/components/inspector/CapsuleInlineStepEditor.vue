<template>
  <div class="capsule-inline-editor">
    <div class="inline-step-header">
      <span class="inline-step-type">{{ typeLabel(innerStep.type) }}</span>
      <input
        class="inline-step-label"
        v-model="localLabel"
        @blur="commitLabel"
        @keydown.enter="($event.target as HTMLInputElement).blur()"
      />
    </div>

    <template v-if="innerStep.config.type === 'presentation'">
      <div class="inspector-field">
        <FieldLabel label="Text" />
        <textarea v-model="localTemplate" rows="5" @blur="commitTemplate" />
      </div>
    </template>

    <template v-else-if="innerStep.config.type === 'model-call'">
      <div class="inspector-field">
        <FieldLabel label="Model" required />
        <select v-model="localModelKey" @change="commitModelCall">
          <option value="">— select model —</option>
          <optgroup v-for="ep in endpointsStore.endpoints" :key="ep.id" :label="ep.name">
            <option
              v-for="m in modelsForEndpoint(ep.id)"
              :key="m.id"
              :value="`${m.endpointId}::${m.providerModelName}`"
            >{{ m.displayName }}</option>
          </optgroup>
        </select>
        <label class="checkbox-row" title="Run this model on the first enabled endpoint that has it">
          <input type="checkbox" v-model="localUseAnyEndpoint" @change="commitModelCall" />
          <span>Use this model on any enabled endpoint</span>
        </label>
      </div>
      <div class="inspector-field">
        <FieldLabel label="Mode" />
        <select v-model="localMode" @change="commitModelCall">
          <option value="generate">Generate</option>
          <option value="chat">Chat</option>
        </select>
      </div>
      <div class="inspector-field">
        <FieldLabel label="Temperature" />
        <input
          type="number"
          min="0"
          max="2"
          step="0.05"
          v-model="localTemperature"
          placeholder="default"
          @blur="commitModelCall"
        />
      </div>
      <div class="inspector-field">
        <FieldLabel label="Max tokens" />
        <input
          type="number"
          min="1"
          step="128"
          v-model="localMaxTokens"
          placeholder="default"
          @blur="commitModelCall"
        />
      </div>
      <div class="inspector-field">
        <FieldLabel label="Output format" />
        <select v-model="localOutputType" @change="commitModelCall">
          <option value="auto">Auto</option>
          <option value="text">Text only</option>
          <option value="json">JSON strict</option>
        </select>
      </div>
    </template>

    <p v-else class="unsupported-hint">
      This inline step type can run, but it cannot be edited here or locked into a Capsule yet.
    </p>

    <PromptCompositionEditor
      v-if="hasPromptBlocks"
      :step-id="innerStep.id"
      :config="innerStep.prompt"
      :context-steps="contextSteps"
      :nested-edit-target="{kind: 'inline-capsule', parentStepId: capsuleStepId}"
    />
  </div>
</template>

<script setup lang="ts">
import {computed, ref, watch} from 'vue';
import type {PipelineStep, StepType} from '@lorca/core';
import {FieldLabel} from '@lorca/ui-kit';
import {usePipelineEditorStore} from '../../stores/pipelineEditor.js';
import {useEndpointsStore} from '../../stores/endpoints.js';
import {useModelsStore} from '../../stores/models.js';
import PromptCompositionEditor from './PromptCompositionEditor.vue';

const props = defineProps<{
  capsuleStepId: string;
  innerStep: PipelineStep;
}>();

const editorStore = usePipelineEditorStore();
const endpointsStore = useEndpointsStore();
const modelsStore = useModelsStore();

const localLabel = ref('');
const localTemplate = ref('');
const localModelKey = ref('');
const localUseAnyEndpoint = ref(false);
const localMode = ref<'generate' | 'chat'>('generate');
const localTemperature = ref('');
const localMaxTokens = ref('');
const localOutputType = ref<'text' | 'auto' | 'json'>('auto');

const contextSteps = computed(() =>
  editorStore.contextStepsForInlineCapsuleInner(props.capsuleStepId, props.innerStep.id),
);

const hasPromptBlocks = computed(() =>
  props.innerStep.type === 'model-call' || Boolean(props.innerStep.prompt?.blocks?.length),
);

watch(() => props.innerStep, (s) => {
  localLabel.value = s.label;
  if (s.config.type === 'presentation') localTemplate.value = s.config.text;
  if (s.config.type === 'model-call') {
    localUseAnyEndpoint.value = s.config.modelRef.kind === 'any-enabled-endpoint';
    localModelKey.value = s.config.modelRef.kind === 'fixed'
      ? `${s.config.modelRef.endpointId}::${s.config.modelRef.modelName}`
      : s.config.modelRef.kind === 'any-enabled-endpoint'
        ? modelKeyForName(s.config.modelRef.modelName)
        : '';
    localMode.value = s.config.mode;
    localTemperature.value = s.config.temperature !== undefined ? String(s.config.temperature) : '';
    localMaxTokens.value = s.config.maxTokens !== undefined ? String(s.config.maxTokens) : '';
    localOutputType.value = s.config.outputType ?? 'auto';
  }
}, {immediate: true});

function typeLabel(type: StepType): string {
  const labels: Record<StepType, string> = {
    'model-call': 'Model',
    'presentation': 'Text',
    'capsule-instance': 'Capsule',
    'loop-group': 'Loop',
  };
  return labels[type] ?? type;
}

function modelsForEndpoint(endpointId: string) {
  return modelsStore.modelsByEndpoint.get(endpointId) ?? [];
}

function modelKeyForName(modelName: string): string {
  const model = modelsStore.models.find((m) => m.providerModelName === modelName);
  return model ? `${model.endpointId}::${model.providerModelName}` : '';
}

function modelNameFromKey(key: string): string {
  return key ? key.split('::').slice(1).join('::') : '';
}

function commitLabel() {
  if (localLabel.value === props.innerStep.label) return;
  editorStore.commitInlineCapsuleInnerStepEdit(
    props.capsuleStepId,
    props.innerStep.id,
    {label: localLabel.value.trim() || props.innerStep.label},
    'Rename inline step',
  );
}

function commitTemplate() {
  const s = props.innerStep;
  if (s.config.type !== 'presentation') return;
  editorStore.commitInlineCapsuleInnerStepEdit(
    props.capsuleStepId,
    s.id,
    {config: {...s.config, text: localTemplate.value}},
    'Edit inline text',
  );
}

function commitModelCall() {
  const s = props.innerStep;
  if (s.config.type !== 'model-call') return;
  const parts = localModelKey.value.split('::');
  const modelName = modelNameFromKey(localModelKey.value);
  const modelRef = modelName
    ? localUseAnyEndpoint.value
      ? {kind: 'any-enabled-endpoint' as const, modelName}
      : {kind: 'fixed' as const, endpointId: parts[0] ?? '', modelName}
    : s.config.modelRef;
  const nextConfig = {...s.config, modelRef, mode: localMode.value};
  const temp = parseFloat(localTemperature.value);
  if (!Number.isNaN(temp)) nextConfig.temperature = temp;
  else delete nextConfig.temperature;
  const maxTok = parseInt(localMaxTokens.value, 10);
  if (!Number.isNaN(maxTok) && maxTok > 0) nextConfig.maxTokens = maxTok;
  else delete nextConfig.maxTokens;
  if (localOutputType.value === 'auto') delete nextConfig.outputType;
  else nextConfig.outputType = localOutputType.value;
  editorStore.commitInlineCapsuleInnerStepEdit(
    props.capsuleStepId,
    s.id,
    {config: nextConfig},
    'Update inline model',
  );
}
</script>

<style scoped>
.capsule-inline-editor {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.inline-step-header {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}
.inline-step-type {
  font-size: 0.68rem;
  padding: 2px 6px;
  border-radius: 3px;
  background: #21182a;
  color: #c6b4d8;
  flex-shrink: 0;
}
.inline-step-label {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  border-bottom: 1px solid #2a2a2a;
  color: #e8e8e8;
  padding: 3px 0;
}
.inline-step-label:focus {
  outline: none;
  border-bottom-color: #5a4770;
}
.unsupported-hint {
  margin: 0;
  color: #9a7f4c;
  font-size: 0.78rem;
  line-height: 1.4;
}
select,
input,
textarea {
  width: 100%;
  background: #111;
  border: 1px solid #2a2a2a;
  color: #e8e8e8;
  border-radius: 3px;
  padding: 4px 6px;
  font-size: 0.78rem;
}
textarea {
  resize: vertical;
  font-family: inherit;
  line-height: 1.45;
}
</style>
