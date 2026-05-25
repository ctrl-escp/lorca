<script setup lang="ts">
import {ref, watch} from 'vue';
import type {ModelCallStepConfig, PipelineStep} from '@lorca/core';
import {FieldLabel} from '@lorca/ui-kit';
import {useModelsStore} from '../../stores/models.js';
import {useEndpointsStore} from '../../stores/endpoints.js';
import {modelKeyFromRef, tryAutoSelectModelCallStep} from '../../utils/modelAutoSelect.js';

const props = defineProps<{
  step: PipelineStep;
}>();

const emit = defineEmits<{
  commit: [patch: Partial<PipelineStep>];
  'commit-config': [config: ModelCallStepConfig, label: string];
  'begin-edit': [];
}>();

const modelsStore = useModelsStore();
const endpointsStore = useEndpointsStore();

const localModelKey = ref('');
const autoSelectWarning = ref('');
const localUseAnyEndpoint = ref(false);
const localMode = ref<'generate' | 'chat'>('generate');
const localTemperature = ref('');
const localMaxTokens = ref('');
const localOutputType = ref<'text' | 'auto' | 'json'>('auto');

watch(() => props.step, (s) => {
  if (s.config.type !== 'model-call') return;
  const cfg = s.config;
  localUseAnyEndpoint.value = cfg.modelRef.kind === 'any-enabled-endpoint';
  localModelKey.value = cfg.modelRef.kind === 'fixed'
    ? `${cfg.modelRef.endpointId}::${cfg.modelRef.modelName}`
    : cfg.modelRef.kind === 'any-enabled-endpoint'
      ? modelKeyForName(cfg.modelRef.modelName)
      : '';
  localMode.value = cfg.mode;
  localTemperature.value = cfg.temperature !== undefined ? String(cfg.temperature) : '';
  localMaxTokens.value = cfg.maxTokens !== undefined ? String(cfg.maxTokens) : '';
  localOutputType.value = cfg.outputType ?? 'auto';
}, {immediate: true});

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

function commitModelCall() {
  const s = props.step;
  if (s.config.type !== 'model-call') return;
  const parts = localModelKey.value.split('::');
  const modelName = modelNameFromKey(localModelKey.value);
  const modelRef = modelName
    ? localUseAnyEndpoint.value
      ? {kind: 'any-enabled-endpoint' as const, modelName}
      : {kind: 'fixed' as const, endpointId: parts[0] ?? '', modelName}
    : s.config.modelRef;
  const patch: Partial<ModelCallStepConfig> = {modelRef, mode: localMode.value};
  const temp = parseFloat(localTemperature.value);
  if (!isNaN(temp)) patch.temperature = temp;
  const maxTok = parseInt(localMaxTokens.value, 10);
  if (!isNaN(maxTok) && maxTok > 0) patch.maxTokens = maxTok;
  emit('commit-config', {...s.config, ...patch}, 'Update model call');
}

function autoSelectModel() {
  const s = props.step;
  if (s.config.type !== 'model-call') return;
  const result = tryAutoSelectModelCallStep(s, modelsStore.models);
  if (result.ok) {
    autoSelectWarning.value = '';
    localUseAnyEndpoint.value = false;
    localModelKey.value = modelKeyFromRef(result.modelRef);
    commitModelCall();
  } else {
    autoSelectWarning.value = result.warning;
  }
}

function commitOutputType() {
  const s = props.step;
  if (s.config.type !== 'model-call') return;
  const {outputType: _old, ...rest} = s.config;
  const newConfig = localOutputType.value === 'auto'
    ? rest as ModelCallStepConfig
    : {...rest, outputType: localOutputType.value} as ModelCallStepConfig;
  emit('commit-config', newConfig, 'Update output format');
}
</script>

<template>
  <template v-if="step.config.type === 'model-call'">
    <div class="inspector-field">
      <FieldLabel label="Model" required title="Which model to call for this step" />
      <div class="model-select-row">
        <select v-model="localModelKey" title="Select a model" @change="commitModelCall">
          <option value="">— select model —</option>
          <optgroup v-for="ep in endpointsStore.endpoints" :key="ep.id" :label="ep.name">
            <option
              v-for="m in modelsForEndpoint(ep.id)"
              :key="m.id"
              :value="`${m.endpointId}::${m.providerModelName}`"
            >
              {{ m.displayName }}
            </option>
          </optgroup>
        </select>
        <button type="button" class="btn-autoselect" title="Auto-select a suitable model" @click="autoSelectModel">Auto</button>
      </div>
      <p v-if="autoSelectWarning" class="model-select-warning">{{ autoSelectWarning }}</p>
      <label class="checkbox-row" title="Run this model on the first enabled endpoint that has it">
        <input type="checkbox" v-model="localUseAnyEndpoint" @change="commitModelCall" />
        <span>Use this model on any enabled endpoint</span>
      </label>
    </div>
    <div class="inspector-field">
      <FieldLabel label="Mode" title="Generate: single prompt → single response. Chat: system + user message roles." />
      <select v-model="localMode" title="Inference mode" @change="commitModelCall">
        <option value="generate">Generate</option>
        <option value="chat">Chat</option>
      </select>
    </div>
    <div class="inspector-field">
      <FieldLabel label="Temperature" title="Sampling temperature (leave blank for model default)" />
      <input
        type="number" min="0" max="2" step="0.05"
        v-model="localTemperature"
        placeholder="default"
        title="Sampling temperature"
        @focus="emit('begin-edit')"
        @blur="commitModelCall"
      />
    </div>
    <div class="inspector-field">
      <FieldLabel label="Max tokens" title="Maximum output tokens (leave blank for model default)" />
      <input
        type="number" min="1" step="128"
        v-model="localMaxTokens"
        placeholder="default"
        title="Maximum output tokens"
        @focus="emit('begin-edit')"
        @blur="commitModelCall"
      />
    </div>
    <div class="inspector-field">
      <FieldLabel label="Output format" title="How to handle the model's text output" />
      <select v-model="localOutputType" title="Output format" @change="commitOutputType">
        <option value="auto">Auto (try JSON, fall back silently)</option>
        <option value="text">Text only (no JSON attempt)</option>
        <option value="json">JSON strict (fail if not valid JSON)</option>
      </select>
    </div>
  </template>
</template>

<style scoped>
.inspector-field { display: flex; flex-direction: column; gap: 0.3rem; }
.model-select-row { display: flex; gap: 0.4rem; align-items: center; }
.model-select-row select { flex: 1; min-width: 0; }
.btn-autoselect {
  flex-shrink: 0; font-size: 0.75rem; padding: 4px 8px;
  background: var(--accent-bg-muted); color: var(--accent);
  border: 1px solid var(--accent-border-muted); border-radius: 4px; cursor: pointer;
}
.btn-autoselect:hover { background: var(--accent-bg); }
.model-select-warning { font-size: 0.75rem; color: #c9a227; margin: 0; }
.checkbox-row { display: flex; align-items: center; gap: 0.4rem; font-size: 0.82rem; color: var(--text-muted); cursor: pointer; }
</style>
