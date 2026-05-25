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
        <TextEditor
          v-model="localTemplate"
          :rows="5"
          :artifact-refs="templateArtifactRefs"
          @blur="commitTemplate"
        />
      </div>
    </template>

    <template v-else-if="innerStep.config.type === 'model-call'">
      <p v-if="slotOverrideWarning" class="slot-override-warning">{{ slotOverrideWarning }}</p>
      <div class="inspector-field">
        <FieldLabel
          :label="modelSlotName ? `Model slot: ${modelSlotName}` : 'Model'"
          required
          :title="modelSlotName ? 'Model assigned to this capsule slot on the instance' : 'Model for this step'"
        />
        <div class="model-select-row">
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
          <button type="button" class="btn-autoselect" title="Auto-select a suitable model" @click="autoSelectModel">Auto</button>
        </div>
        <p v-if="modelSlotName" class="slot-binding-hint">
          Uses the capsule instance's model slot assignments. Changing this updates the same binding shown on the capsule step.
        </p>
        <p v-if="autoSelectWarning" class="model-select-warning">{{ autoSelectWarning }}</p>
        <label v-if="!modelSlotName" class="checkbox-row" title="Run this model on the first enabled endpoint that has it">
          <input type="checkbox" v-model="localUseAnyEndpoint" @change="commitModelCall" />
          <span>Use this model on any enabled endpoint</span>
        </label>
        <label v-else class="checkbox-row" title="Run this model on the first enabled endpoint that has it">
          <input type="checkbox" v-model="localUseAnyEndpoint" @change="commitModelCall" />
          <span>Use this slot model on any enabled endpoint</span>
        </label>
        <button
          v-if="canRestoreSlotBinding"
          type="button"
          class="btn-restore-slot"
          @click="restoreSlotBinding"
        >
          Restore slot binding
        </button>
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
import type {PipelineStep, StepType, ModelRef, CapsuleInstanceStepConfig} from '@lorca/core';
import {FieldLabel} from '@lorca/ui-kit';
import {usePipelineEditorStore} from '../../stores/pipelineEditor.js';
import {useCapsulesStore} from '../../stores/capsules.js';
import {useEndpointsStore} from '../../stores/endpoints.js';
import {useModelsStore} from '../../stores/models.js';
import PromptCompositionEditor from './PromptCompositionEditor.vue';
import TextEditor from '../shared/TextEditor.vue';
import {
  autoSelectCapsuleSlot,
  modelKeyFromRef,
  tryAutoSelectModelCallStep,
} from '../../utils/modelAutoSelect.js';
import {artifactRefsBeforeStep} from '../../utils/artifactRefs.js';

const props = defineProps<{
  capsuleStepId: string;
  innerStep: PipelineStep;
}>();

const editorStore = usePipelineEditorStore();
const capsulesStore = useCapsulesStore();
const endpointsStore = useEndpointsStore();
const modelsStore = useModelsStore();

const localLabel = ref('');
const localTemplate = ref('');
const localModelKey = ref('');
const autoSelectWarning = ref('');
const slotOverrideWarning = ref('');
const localUseAnyEndpoint = ref(false);
const localMode = ref<'generate' | 'chat'>('generate');
const localTemperature = ref('');
const localMaxTokens = ref('');
const localOutputType = ref<'text' | 'auto' | 'json'>('auto');

const capsuleInstanceStep = computed((): (PipelineStep & {config: CapsuleInstanceStepConfig}) | null => {
  const step = editorStore.pipeline.steps.find((s) => s.id === props.capsuleStepId);
  if (!step || step.config.type !== 'capsule-instance') return null;
  return step as PipelineStep & {config: CapsuleInstanceStepConfig};
});

const resolvedCapsule = computed(() => {
  const inst = capsuleInstanceStep.value;
  if (!inst) return undefined;
  return capsulesStore.getCapsule(inst.config.capsuleId, inst.config.capsuleVersion);
});

const modelSlotName = computed((): string | null => {
  const cfg = props.innerStep.config;
  if (cfg.type !== 'model-call' || cfg.modelRef.kind !== 'slot') return null;
  return cfg.modelRef.slotName;
});

const resolvedModelSlot = computed(() => {
  const slotName = modelSlotName.value;
  if (!slotName) return null;
  return resolvedCapsule.value?.interface.modelSlots.find((s) => s.name === slotName) ?? null;
});

const savedSlotModelRef = computed((): ModelRef | null => {
  const saved = resolvedCapsule.value?.steps?.find((s) => s.id === props.innerStep.id);
  if (saved?.config.type !== 'model-call' || saved.config.modelRef.kind !== 'slot') return null;
  return saved.config.modelRef;
});

const canRestoreSlotBinding = computed(() => {
  const cfg = props.innerStep.config;
  return cfg.type === 'model-call'
    && cfg.modelRef.kind !== 'slot'
    && savedSlotModelRef.value !== null;
});

const contextSteps = computed(() =>
  editorStore.contextStepsForInlineCapsuleInner(props.capsuleStepId, props.innerStep.id),
);

const templateArtifactRefs = computed(() => artifactRefsBeforeStep(contextSteps.value, props.innerStep.id));

const hasPromptBlocks = computed(() =>
  props.innerStep.type === 'model-call' || Boolean(props.innerStep.prompt?.blocks?.length),
);

function applyModelRefToLocal(modelRef: ModelRef | undefined) {
  localUseAnyEndpoint.value = modelRef?.kind === 'any-enabled-endpoint';
  localModelKey.value = modelRef?.kind === 'fixed'
    ? `${modelRef.endpointId}::${modelRef.modelName}`
    : modelRef?.kind === 'any-enabled-endpoint'
      ? modelKeyForName(modelRef.modelName)
      : '';
}

watch(
  () => [props.innerStep, capsuleInstanceStep.value?.config.modelSlotBindings] as const,
  ([s, slotBindings]) => {
    localLabel.value = s.label;
    slotOverrideWarning.value = '';
    if (s.config.type === 'presentation') localTemplate.value = s.config.text;
    if (s.config.type === 'model-call') {
      if (s.config.modelRef.kind === 'slot') {
        applyModelRefToLocal(slotBindings?.[s.config.modelRef.slotName]);
      } else {
        applyModelRefToLocal(s.config.modelRef);
        const saved = savedSlotModelRef.value;
        if (saved?.kind === 'slot') {
          slotOverrideWarning.value =
            `This step uses a direct model override instead of capsule slot "${saved.slotName}". Execution ignores the capsule's slot assignments for this step.`;
        }
      }
      localMode.value = s.config.mode;
      localTemperature.value = s.config.temperature !== undefined ? String(s.config.temperature) : '';
      localMaxTokens.value = s.config.maxTokens !== undefined ? String(s.config.maxTokens) : '';
      localOutputType.value = s.config.outputType ?? 'auto';
    }
  },
  {immediate: true, deep: true},
);

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

function modelRefFromLocalKey(): ModelRef | undefined {
  const modelName = modelNameFromKey(localModelKey.value);
  if (!modelName) return undefined;
  const parts = localModelKey.value.split('::');
  return localUseAnyEndpoint.value
    ? {kind: 'any-enabled-endpoint', modelName}
    : {kind: 'fixed', endpointId: parts[0] ?? '', modelName};
}

function commitCapsuleSlotBinding(slotName: string) {
  const parent = capsuleInstanceStep.value;
  if (!parent) return;
  const bindings = {...(parent.config.modelSlotBindings ?? {})};
  const modelRef = modelRefFromLocalKey();
  if (modelRef) bindings[slotName] = modelRef;
  else delete bindings[slotName];
  editorStore.commitStepConfigEdit(
    props.capsuleStepId,
    {config: {...parent.config, modelSlotBindings: bindings}},
    `Update ${slotName} model slot`,
  );
}

function restoreSlotBinding() {
  const saved = savedSlotModelRef.value;
  if (!saved || saved.kind !== 'slot') return;
  const s = props.innerStep;
  if (s.config.type !== 'model-call') return;
  editorStore.commitInlineCapsuleInnerStepEdit(
    props.capsuleStepId,
    s.id,
    {config: {...s.config, modelRef: saved}},
    'Restore slot model binding',
  );
}

function commitModelCall() {
  const s = props.innerStep;
  if (s.config.type !== 'model-call') return;
  if (s.config.modelRef.kind === 'slot') {
    autoSelectWarning.value = '';
    commitCapsuleSlotBinding(s.config.modelRef.slotName);
    const nextConfig = {...s.config, mode: localMode.value};
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
      'Update inline model settings',
    );
    return;
  }
  const modelRef = modelRefFromLocalKey() ?? s.config.modelRef;
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

function autoSelectModel() {
  autoSelectWarning.value = '';
  const slotName = modelSlotName.value;
  const slot = resolvedModelSlot.value;
  if (slotName && slot) {
    const disabledEndpointIds = new Set(endpointsStore.endpoints.filter((e) => !e.enabled).map((e) => e.id));
    const models = modelsStore.models.filter((m) => m.enabled !== false && !disabledEndpointIds.has(m.endpointId));
    const result = autoSelectCapsuleSlot(slot, models);
    if (result.ok) {
      localUseAnyEndpoint.value = false;
      localModelKey.value = modelKeyFromRef(result.modelRef);
      commitCapsuleSlotBinding(slotName);
    } else {
      autoSelectWarning.value = result.warning;
    }
    return;
  }
  const s = props.innerStep;
  if (s.config.type !== 'model-call') return;
  const result = tryAutoSelectModelCallStep(s, modelsStore.models);
  if (result.ok) {
    localUseAnyEndpoint.value = false;
    localModelKey.value = modelKeyFromRef(result.modelRef);
    commitModelCall();
  } else {
    autoSelectWarning.value = result.warning;
  }
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
input {
  width: 100%;
  background: #111;
  border: 1px solid #2a2a2a;
  color: #e8e8e8;
  border-radius: 3px;
  padding: 4px 6px;
  font-size: 0.78rem;
}
.model-select-row { display: flex; gap: 0.4rem; align-items: center; margin-bottom: 0.25rem; }
.model-select-row select { flex: 1; min-width: 0; }
.btn-autoselect { background: #1a1a1a; border: 1px solid #333; color: #aaa; padding: 4px 8px; border-radius: 4px; font-size: 0.78rem; cursor: pointer; }
.btn-autoselect:hover { background: #222; color: #ccc; border-color: var(--text-muted); }
.model-select-warning {
  margin: 0;
  color: #c8a050;
  font-size: 0.72rem;
  line-height: 1.35;
}
.slot-binding-hint {
  margin: 0;
  color: var(--text-label);
  font-size: 0.68rem;
  line-height: 1.35;
}
.slot-override-warning {
  margin: 0;
  padding: 0.45rem 0.5rem;
  border-radius: 4px;
  border: 1px solid #4a4020;
  background: #2a2418;
  color: #c8a050;
  font-size: 0.72rem;
  line-height: 1.35;
}
.btn-restore-slot {
  align-self: flex-start;
  background: #17131c;
  border: 1px solid #3a3245;
  color: #c6b4d8;
  padding: 3px 8px;
  font-size: 0.72rem;
  border-radius: 3px;
  cursor: pointer;
}
.btn-restore-slot:hover { background: #21182a; }
</style>
