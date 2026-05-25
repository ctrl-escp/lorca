<template>
  <LeftPaneSectionShell
    :expanded="expanded"
    title="Models"
    title-class="hdr-model"
    :count="modelsStore.models.length"
    @toggle="$emit('toggle')"
  >
    <template #actions>
      <button
        class="icon-btn"
        :class="{active: showAddModel}"
        :disabled="endpointsStore.endpoints.length === 0"
        title="Add model manually"
        @click="openAddModel"
      >+</button>
    </template>

    <AddModelForm v-if="showAddModel" :endpoints="endpointsStore.endpoints" @add="onAddModel" @cancel="showAddModel = false" />
    <select v-model="modelBucketFilter" class="model-bucket-filter" aria-label="Filter models by usage bucket">
      <option v-for="opt in MODEL_BUCKET_OPTIONS" :key="opt.value || 'all'" :value="opt.value">{{ opt.label }}</option>
    </select>
    <p v-if="canAssignModelToStep" class="model-assign-hint">Click a model to assign it to the selected step.</p>
    <div class="model-list">
      <div
        v-for="model in filteredModels"
        :key="model.id"
        class="model-row"
        :class="{assignable: canAssignModelToStep && model.enabled !== false, disabled: model.enabled === false}"
        :title="model.enabled === false ? `${model.displayName} (disabled)` : canAssignModelToStep ? `Assign ${model.displayName} to selected step` : model.displayName"
        @click="model.enabled !== false && onModelClick(model)"
      >
        <div class="model-row-header">
          <span class="model-name">{{ model.displayName }}</span>
          <div class="model-row-badges">
            <span class="model-badge-disabled" v-if="model.enabled === false">disabled</span>
            <span class="model-source" :class="`source-${model.source}`">{{ model.source }}</span>
          </div>
        </div>
        <ModelBucketEditor :model="model" @update="onUpdateBuckets(model.id, $event)" @click.stop />
        <button
          class="btn-toggle-model"
          :class="model.enabled === false ? 'btn-toggle-enable' : 'btn-toggle-disable'"
          :title="model.enabled === false ? 'Enable this model for auto-assignment' : 'Disable this model (exclude from auto-assignment)'"
          @click.stop="onToggleModel(model.id)"
        >{{ model.enabled === false ? 'Enable' : 'Disable' }}</button>
      </div>
      <p v-if="modelsStore.models.length === 0" class="empty-hint">No models. Discover from an endpoint or add manually.</p>
      <p v-else-if="filteredModels.length === 0" class="empty-hint">No models match this filter.</p>
    </div>
  </LeftPaneSectionShell>
</template>

<script setup lang="ts">
import {ref, computed} from 'vue';
import type {DiscoveredModel, ModelUsageBucket} from '@lorca/core';
import {modelMatchesBucket} from '@lorca/endpoints';
import {useEndpointsStore} from '../../stores/endpoints.js';
import {useModelsStore} from '../../stores/models.js';
import {useUiStore} from '../../stores/ui.js';
import {useActiveStepEditor} from '../../composables/useActiveStepEditor.js';
import {usePipelineImpactWarning} from '../../composables/usePipelineImpactWarning.js';
import AddModelForm from '../models/AddModelForm.vue';
import ModelBucketEditor from '../models/ModelBucketEditor.vue';
import LeftPaneSectionShell from './LeftPaneSectionShell.vue';

defineProps<{expanded: boolean}>();
defineEmits<{toggle: []}>();

const MODEL_BUCKET_OPTIONS: {value: ModelUsageBucket | ''; label: string}[] = [
  {value: '', label: 'All buckets'},
  {value: 'tiny', label: 'Tiny'},
  {value: 'thinking', label: 'Thinking'},
  {value: 'summarize', label: 'Summarize'},
  {value: 'rewrite', label: 'Rewrite'},
  {value: 'rewrite-prose', label: 'Rewrite prose'},
  {value: 'rewrite-code', label: 'Rewrite code'},
  {value: 'extract-json', label: 'Extract JSON'},
  {value: 'verify', label: 'Verify'},
  {value: 'general', label: 'General'},
];

const endpointsStore = useEndpointsStore();
const modelsStore = useModelsStore();
const uiStore = useUiStore();
const editorStore = useActiveStepEditor();
const {confirmDisable, stepsUsingModel} = usePipelineImpactWarning();

const showAddModel = ref(false);
const modelBucketFilter = ref<ModelUsageBucket | ''>('');

const filteredModels = computed(() => {
  if (!modelBucketFilter.value) return modelsStore.models;
  return modelsStore.models.filter((m) => modelMatchesBucket(m, modelBucketFilter.value as ModelUsageBucket));
});

const canAssignModelToStep = computed(() => {
  const step = editorStore.selectedStep;
  return step?.type === 'model-call' && step.config.type === 'model-call';
});

function openAddModel() {
  uiStore.expandLeftPaneSection('models');
  showAddModel.value = !showAddModel.value;
}

async function onToggleModel(id: string) {
  const model = modelsStore.models.find((m) => m.id === id);
  if (!model) return;
  if (model.enabled !== false) {
    const affected = stepsUsingModel(model.endpointId, model.providerModelName);
    if (affected.length > 0) {
      const ok = await confirmDisable(model.displayName, affected.map((s) => s.label));
      if (!ok) return;
    }
  }
  await modelsStore.toggleModel(id);
}

async function onAddModel(model: DiscoveredModel) {
  await modelsStore.addModel(model);
  showAddModel.value = false;
}

function onModelClick(model: DiscoveredModel) {
  const step = editorStore.selectedStep;
  if (!step || step.type !== 'model-call' || step.config.type !== 'model-call') return;
  editorStore.commitStepConfigEdit(
    step.id,
    {
      config: {
        ...step.config,
        modelRef: {kind: 'fixed', endpointId: model.endpointId, modelName: model.providerModelName},
      },
    },
    `Assign model "${model.displayName}"`,
  );
}

async function onUpdateBuckets(modelId: string, buckets: ModelUsageBucket[] | undefined) {
  if (buckets === undefined) {
    const model = modelsStore.models.find((m) => m.id === modelId);
    if (model) {
      const {userBuckets: _removed, ...rest} = model;
      await modelsStore.addModel(rest);
    }
  } else {
    await modelsStore.setUserBuckets(modelId, buckets);
  }
}
</script>

<style scoped>
.model-list { display: flex; flex-direction: column; gap: 0.5rem; }

.model-bucket-filter {
  width: 100%;
  background: #111;
  border: 1px solid #2a2a2a;
  color: #ccc;
  border-radius: 5px;
  padding: 8px 12px;
  font-size: 0.88rem;
  margin-bottom: 0.2rem;
}
.model-assign-hint {
  font-size: 0.85rem;
  color: var(--accent);
  margin: 0 0 0.35rem;
}
.model-row { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 7px; padding: 0.75rem 1rem; display: flex; flex-direction: column; gap: 0.4rem; }
.model-row.disabled { opacity: 0.5; }
.model-row.assignable { cursor: pointer; border-color: var(--accent-border-muted); }
.model-row.assignable:hover { background: #1e2d3d; border-color: #3a6a9a; }
.model-row-header { display: flex; justify-content: space-between; align-items: center; }
.model-row-badges { display: flex; gap: 0.3rem; align-items: center; }
.model-name { font-size: 0.95rem; font-weight: 500; }
.model-badge-disabled { font-size: 0.68rem; padding: 1px 6px; border-radius: 3px; background: #2a2010; color: #b89a50; }
.model-source { font-size: 0.75rem; padding: 2px 7px; border-radius: 4px; }
.source-discovered { background: #1e2d1e; color: #6db86d; }
.source-manual { background: #2d2a1e; color: #c8a85a; }
.btn-toggle-model {
  align-self: flex-start;
  font-size: 0.7rem;
  padding: 2px 8px;
  border-radius: 3px;
  cursor: pointer;
  background: none;
}
.btn-toggle-disable { border: 1px solid #333; color: var(--text-label); }
.btn-toggle-disable:hover { color: #aaa; border-color: var(--text-secondary); }
.btn-toggle-enable { border: 1px solid #1e4d37; color: #5ddb9e; }
.btn-toggle-enable:hover { background: #1a2d22; }

.empty-hint { font-size: 0.88rem; color: var(--text-secondary); margin: 0; }

.icon-btn { background: none; border: 1px solid #333; color: var(--text-label); border-radius: 5px; width: 36px; height: 36px; cursor: pointer; font-size: 1.2rem; line-height: 1; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.icon-btn:hover:not(:disabled) { background: #222; color: #ccc; }
.icon-btn:disabled { opacity: 0.3; cursor: default; }
.icon-btn.active { background: var(--accent-bg); border-color: var(--accent-border); color: var(--accent); }
</style>
