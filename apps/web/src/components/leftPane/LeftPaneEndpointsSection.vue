<template>
  <LeftPaneSectionShell
    :expanded="expanded"
    title="Endpoints"
    title-class="hdr-endpoint"
    :count="endpointsStore.endpoints.length"
    @toggle="$emit('toggle')"
  >
    <template #actions>
      <button class="icon-btn" :class="{active: showAddEndpoint}" title="Add a new AI endpoint" @click="openAddEndpoint">+</button>
    </template>

    <AddEndpointForm v-if="showAddEndpoint" @add="onAddEndpoint" @cancel="showAddEndpoint = false" />
    <div class="ep-list">
      <template v-for="ep in endpointsStore.endpoints" :key="ep.id">
        <AddEndpointForm
          v-if="editingEndpointId === ep.id"
          :initial="ep"
          @save="onSaveEndpoint"
          @cancel="editingEndpointId = null"
        />
        <EndpointCard
          v-else
          :endpoint="ep"
          :model-count="(modelsStore.modelsByEndpoint.get(ep.id) ?? []).length"
          :is-testing="epActions.testing.value.has(ep.id)"
          :is-discovering="epActions.discovering.value.has(ep.id)"
          :action-error="epActions.actionErrors.value.get(ep.id) ?? ''"
          @test="epActions.testAccess"
          @discover="epActions.discoverModels"
          @edit="editingEndpointId = ep.id"
          @toggle="onToggleEndpoint"
          @remove="onRemoveEndpoint"
        />
      </template>
      <p v-if="endpointsStore.endpoints.length === 0" class="empty-hint">No endpoints yet. Add one above.</p>
    </div>
  </LeftPaneSectionShell>
</template>

<script setup lang="ts">
import {ref} from 'vue';
import type {AiEndpointConfig} from '@lorca/core';
import {useEndpointsStore} from '../../stores/endpoints.js';
import {useModelsStore} from '../../stores/models.js';
import {useUiStore} from '../../stores/ui.js';
import {useEndpointActions} from '../../composables/useEndpointActions.js';
import {usePipelineImpactWarning} from '../../composables/usePipelineImpactWarning.js';
import EndpointCard from '../endpoints/EndpointCard.vue';
import AddEndpointForm from '../endpoints/AddEndpointForm.vue';
import LeftPaneSectionShell from './LeftPaneSectionShell.vue';

defineProps<{expanded: boolean}>();
defineEmits<{toggle: []}>();

const endpointsStore = useEndpointsStore();
const modelsStore = useModelsStore();
const uiStore = useUiStore();
const epActions = useEndpointActions();
const {confirmDisable, stepsUsingEndpoint} = usePipelineImpactWarning();

const showAddEndpoint = ref(false);
const editingEndpointId = ref<string | null>(null);

function openAddEndpoint() {
  uiStore.expandLeftPaneSection('endpoints');
  showAddEndpoint.value = !showAddEndpoint.value;
}

async function onAddEndpoint(config: AiEndpointConfig) {
  await endpointsStore.addEndpoint(config);
  showAddEndpoint.value = false;
  const testResult = await epActions.testAccess(config);
  if (testResult.ok) {
    const saved = endpointsStore.getEndpoint(config.id) ?? config;
    await epActions.discoverModels(saved);
  }
}

async function onSaveEndpoint(config: AiEndpointConfig) {
  await endpointsStore.updateEndpoint(config.id, config);
  editingEndpointId.value = null;
}

async function onRemoveEndpoint(id: string) {
  await endpointsStore.removeEndpoint(id);
  await modelsStore.removeModelsForEndpoint(id);
}

async function onToggleEndpoint(id: string) {
  const ep = endpointsStore.getEndpoint(id);
  if (!ep) return;
  if (ep.enabled) {
    const affected = stepsUsingEndpoint(id);
    if (affected.length > 0) {
      const ok = await confirmDisable(ep.name, affected.map((s) => s.label));
      if (!ok) return;
    }
  }
  await endpointsStore.updateEndpoint(id, {enabled: !ep.enabled});
}
</script>

<style scoped>
.ep-list { display: flex; flex-direction: column; gap: 0.5rem; }
.empty-hint { font-size: 0.88rem; color: var(--text-secondary); margin: 0; }

.icon-btn { background: none; border: 1px solid #333; color: var(--text-label); border-radius: 5px; width: 36px; height: 36px; cursor: pointer; font-size: 1.2rem; line-height: 1; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.icon-btn:hover:not(:disabled) { background: #222; color: #ccc; }
.icon-btn:disabled { opacity: 0.3; cursor: default; }
.icon-btn.active { background: var(--accent-bg); border-color: var(--accent-border); color: var(--accent); }
</style>
