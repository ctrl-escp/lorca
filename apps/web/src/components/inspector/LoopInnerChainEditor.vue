<template>
  <div class="loop-inner-editor">
    <div class="loop-inner-header">
      <span class="loop-inner-title">Inner chain</span>
      <span class="loop-inner-hint">Runs each iteration until exit or max iterations</span>
    </div>

    <div v-if="innerSteps.length === 0" class="loop-inner-empty">
      <p>No inner steps. Add at least one step for the loop body.</p>
    </div>

    <div v-else class="loop-inner-list">
      <div
        v-for="(inner, i) in innerSteps"
        :key="inner.id"
        class="loop-inner-row"
        :class="{selected: selectedInnerStepId === inner.id}"
        @click="selectedInnerStepId = inner.id"
      >
        <span class="loop-inner-index">{{ i + 1 }}</span>
        <span class="loop-inner-type">{{ typeLabel(inner.type) }}</span>
        <span class="loop-inner-label">{{ inner.label }}</span>
        <span class="loop-inner-ns">→ {{ inner.outputNamespace }}.*</span>
        <div class="loop-inner-actions" @click.stop>
          <button type="button" class="icon-btn" :disabled="i === 0" title="Move up" @click="editorStore.moveLoopInnerStep(loopStepId, inner.id, 'up')">↑</button>
          <button type="button" class="icon-btn" :disabled="i === innerSteps.length - 1" title="Move down" @click="editorStore.moveLoopInnerStep(loopStepId, inner.id, 'down')">↓</button>
          <button type="button" class="icon-btn danger" title="Remove" @click="editorStore.deleteLoopInnerStep(loopStepId, inner.id)">×</button>
        </div>
      </div>
    </div>

    <div class="loop-inner-add">
      <button type="button" class="btn btn-sm btn-accent" @click="addInner('model-call')">+ Model</button>
      <button type="button" class="btn btn-sm" @click="addInner('prompt-wrapper')">+ Wrapper</button>
      <button type="button" class="btn btn-sm" @click="addInner('manual-text')">+ Text</button>
      <button type="button" class="btn btn-sm" @click="addInner('template')">+ Template</button>
      <button type="button" class="btn btn-sm" @click="addInner('json-extract')">+ JSON</button>
    </div>

    <template v-if="selectedInnerStep">
      <div class="loop-inner-inspector">
        <div class="loop-inner-inspector-header">{{ selectedInnerStep.label }}</div>

        <template v-if="selectedInnerStep.config.type === 'manual-text'">
          <div class="inspector-field">
            <FieldLabel label="Text" />
            <textarea v-model="localText" rows="3" @blur="commitManualText" />
          </div>
        </template>

        <template v-else-if="selectedInnerStep.config.type === 'template'">
          <div class="inspector-field">
            <FieldLabel label="Template" />
            <textarea v-model="localTemplate" rows="4" @blur="commitTemplate" />
          </div>
        </template>

        <template v-else-if="selectedInnerStep.config.type === 'json-extract'">
          <div class="inspector-field">
            <FieldLabel label="Source artifact" />
            <input v-model="localSourceRef" placeholder="prior_step.text" @blur="commitJsonExtract" />
          </div>
        </template>

        <template v-else-if="selectedInnerStep.config.type === 'model-call'">
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
          </div>
        </template>

        <PromptCompositionEditor
          v-if="hasPromptBlocks"
          :step-id="selectedInnerStep.id"
          :config="selectedInnerStep.prompt"
          :context-steps="contextSteps"
          :loop-group-step-id="loopStepId"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import {ref, computed, watch} from 'vue';
import type {PipelineStep, StepType} from '@lorca/core';
import {useActiveStepEditor} from '../../composables/useActiveStepEditor.js';
import {useEndpointsStore} from '../../stores/endpoints.js';
import {useModelsStore} from '../../stores/models.js';
import {FieldLabel} from '@lorca/ui-kit';
import PromptCompositionEditor from './PromptCompositionEditor.vue';

const props = defineProps<{
  loopStepId: string;
  innerSteps: PipelineStep[];
}>();

const editorStore = useActiveStepEditor();
const endpointsStore = useEndpointsStore();
const modelsStore = useModelsStore();

const selectedInnerStepId = ref<string | null>(null);

const selectedInnerStep = computed(() =>
  props.innerSteps.find((s) => s.id === selectedInnerStepId.value) ?? null,
);

const contextSteps = computed(() => {
  const id = selectedInnerStepId.value;
  if (!id) return editorStore.contextStepsForLoopInner(props.loopStepId, props.innerSteps[0]?.id ?? '');
  return editorStore.contextStepsForLoopInner(props.loopStepId, id);
});

const hasPromptBlocks = computed(() => {
  const s = selectedInnerStep.value;
  if (!s) return false;
  return s.type === 'model-call' || s.type === 'prompt-wrapper' || Boolean(s.prompt?.blocks?.length);
});

const localText = ref('');
const localTemplate = ref('');
const localSourceRef = ref('');
const localModelKey = ref('');

watch(selectedInnerStep, (s) => {
  if (!s) return;
  if (s.config.type === 'manual-text') localText.value = s.config.text;
  if (s.config.type === 'template') localTemplate.value = s.config.template;
  if (s.config.type === 'json-extract') localSourceRef.value = s.config.sourceArtifactRef;
  if (s.config.type === 'model-call' && s.config.modelRef.kind === 'fixed') {
    localModelKey.value = `${s.config.modelRef.endpointId}::${s.config.modelRef.modelName}`;
  } else {
    localModelKey.value = '';
  }
}, {immediate: true});

watch(() => props.innerSteps, (steps) => {
  if (selectedInnerStepId.value && !steps.some((s) => s.id === selectedInnerStepId.value)) {
    selectedInnerStepId.value = steps.at(-1)?.id ?? null;
  }
  if (!selectedInnerStepId.value && steps.length > 0) {
    selectedInnerStepId.value = steps[0]!.id;
  }
}, {immediate: true});

function typeLabel(type: StepType): string {
  const labels: Record<StepType, string> = {
    'model-call': 'Model',
    'prompt-wrapper': 'Wrap',
    'template': 'Tpl',
    'json-extract': 'JSON',
    'manual-text': 'Text',
    'capsule-instance': 'Cap',
    'loop-group': 'Loop',
  };
  return labels[type] ?? type;
}

function addInner(type: StepType) {
  const id = editorStore.appendLoopInnerStep(props.loopStepId, type);
  if (id) selectedInnerStepId.value = id;
}

function modelsForEndpoint(endpointId: string) {
  return modelsStore.modelsByEndpoint.get(endpointId) ?? [];
}

function commitManualText() {
  const s = selectedInnerStep.value;
  if (!s || s.config.type !== 'manual-text') return;
  editorStore.commitLoopInnerStepEdit(
    props.loopStepId,
    s.id,
    {config: {...s.config, text: localText.value}},
    'Edit inner text',
  );
}

function commitTemplate() {
  const s = selectedInnerStep.value;
  if (!s || s.config.type !== 'template') return;
  editorStore.commitLoopInnerStepEdit(
    props.loopStepId,
    s.id,
    {config: {...s.config, template: localTemplate.value}},
    'Edit inner template',
  );
}

function commitJsonExtract() {
  const s = selectedInnerStep.value;
  if (!s || s.config.type !== 'json-extract') return;
  editorStore.commitLoopInnerStepEdit(
    props.loopStepId,
    s.id,
    {config: {...s.config, sourceArtifactRef: localSourceRef.value}},
    'Edit inner JSON source',
  );
}

function commitModelCall() {
  const s = selectedInnerStep.value;
  if (!s || s.config.type !== 'model-call') return;
  const parts = localModelKey.value.split('::');
  const modelRef = localModelKey.value
    ? {kind: 'fixed' as const, endpointId: parts[0] ?? '', modelName: parts.slice(1).join('::')}
    : s.config.modelRef;
  editorStore.commitLoopInnerStepEdit(
    props.loopStepId,
    s.id,
    {config: {...s.config, modelRef}},
    'Update inner model',
  );
}
</script>

<style scoped>
.loop-inner-editor {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.35rem;
  padding-top: 0.5rem;
  border-top: 1px solid #2a2a2a;
}
.loop-inner-header { display: flex; flex-direction: column; gap: 0.15rem; }
.loop-inner-title { font-size: 0.78rem; font-weight: 600; color: #aaa; }
.loop-inner-hint { font-size: 0.68rem; color: #555; }
.loop-inner-empty { font-size: 0.75rem; color: #555; }
.loop-inner-list { display: flex; flex-direction: column; gap: 0.25rem; }
.loop-inner-row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.45rem;
  background: #141414;
  border: 1px solid #2a2a2a;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.75rem;
}
.loop-inner-row.selected { border-color: #4a6a8a; background: #1a2430; }
.loop-inner-index { color: #555; min-width: 1rem; }
.loop-inner-type {
  font-size: 0.62rem;
  padding: 1px 4px;
  background: #1e2a1e;
  color: #8ab88a;
  border-radius: 2px;
}
.loop-inner-label { flex: 1; color: #ddd; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.loop-inner-ns { color: #666; font-size: 0.68rem; }
.loop-inner-actions { display: flex; gap: 2px; opacity: 0; }
.loop-inner-row:hover .loop-inner-actions,
.loop-inner-row.selected .loop-inner-actions { opacity: 1; }
.loop-inner-add { display: flex; flex-wrap: wrap; gap: 0.25rem; }
.loop-inner-inspector {
  padding: 0.5rem;
  background: #111;
  border: 1px solid #252525;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.loop-inner-inspector-header { font-size: 0.8rem; font-weight: 500; color: #ccc; }
.inspector-field { display: flex; flex-direction: column; gap: 0.2rem; }
.inspector-field input,
.inspector-field select,
.inspector-field textarea {
  background: #0d0d0d;
  border: 1px solid #2a2a2a;
  color: #e8e8e8;
  border-radius: 3px;
  padding: 4px 6px;
  font-size: 0.78rem;
}
.icon-btn {
  background: transparent;
  border: none;
  color: #888;
  cursor: pointer;
  padding: 0 4px;
  font-size: 0.85rem;
}
.icon-btn:hover:not(:disabled) { color: #ccc; }
.icon-btn:disabled { opacity: 0.3; cursor: default; }
.icon-btn.danger:hover:not(:disabled) { color: #e88; }
</style>
