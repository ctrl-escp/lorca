<template>
  <aside class="left-pane">
    <section class="pane-section">
      <div class="section-header">
        <span class="section-title">Endpoints</span>
        <button class="icon-btn" :class="{active: showAddEndpoint}" @click="showAddEndpoint = !showAddEndpoint" title="Add endpoint">+</button>
      </div>
      <AddEndpointForm v-if="showAddEndpoint" @add="onAddEndpoint" @cancel="showAddEndpoint = false" />
      <div class="ep-list">
        <EndpointCard
          v-for="ep in endpointsStore.endpoints"
          :key="ep.id"
          :endpoint="ep"
          :model-count="(modelsStore.modelsByEndpoint.get(ep.id) ?? []).length"
          :is-testing="epActions.testing.value.has(ep.id)"
          :is-discovering="epActions.discovering.value.has(ep.id)"
          @test="epActions.testAccess"
          @discover="epActions.discoverModels"
          @remove="onRemoveEndpoint"
        />
        <p v-if="endpointsStore.endpoints.length === 0" class="empty-hint">
          No endpoints yet. Add one above.
        </p>
      </div>
    </section>

    <section class="pane-section">
      <div class="section-header">
        <span class="section-title">Models</span>
        <button class="icon-btn" :class="{active: showAddModel}" :disabled="endpointsStore.endpoints.length === 0" @click="showAddModel = !showAddModel" title="Add model manually">+</button>
      </div>
      <AddModelForm
        v-if="showAddModel"
        :endpoints="endpointsStore.endpoints"
        @add="onAddModel"
        @cancel="showAddModel = false"
      />
      <div class="model-list">
        <div v-for="model in modelsStore.models" :key="model.id" class="model-row">
          <div class="model-row-header">
            <span class="model-name">{{ model.displayName }}</span>
            <span class="model-source" :class="`source-${model.source}`">{{ model.source }}</span>
          </div>
          <ModelBucketEditor :model="model" @update="onUpdateBuckets(model.id, $event)" />
        </div>
        <p v-if="modelsStore.models.length === 0" class="empty-hint">
          No models. Discover from an endpoint or add manually.
        </p>
      </div>
    </section>
  </aside>
</template>

<script setup lang="ts">
import {ref, onMounted} from 'vue';
import type {AiEndpointConfig, DiscoveredModel, ModelUsageBucket} from '@lorca/core';
import {useEndpointsStore} from '../stores/endpoints.js';
import {useModelsStore} from '../stores/models.js';
import {useEndpointActions} from '../composables/useEndpointActions.js';
import EndpointCard from './endpoints/EndpointCard.vue';
import AddEndpointForm from './endpoints/AddEndpointForm.vue';
import AddModelForm from './models/AddModelForm.vue';
import ModelBucketEditor from './models/ModelBucketEditor.vue';

const endpointsStore = useEndpointsStore();
const modelsStore = useModelsStore();
const epActions = useEndpointActions();

const showAddEndpoint = ref(false);
const showAddModel = ref(false);

onMounted(async () => {
  await endpointsStore.load();
  await modelsStore.load();
});

async function onAddEndpoint(config: AiEndpointConfig) {
  await endpointsStore.addEndpoint(config);
  showAddEndpoint.value = false;
}

async function onRemoveEndpoint(id: string) {
  await endpointsStore.removeEndpoint(id);
  await modelsStore.removeModelsForEndpoint(id);
}

async function onAddModel(model: DiscoveredModel) {
  await modelsStore.addModel(model);
  showAddModel.value = false;
}

async function onUpdateBuckets(modelId: string, buckets: ModelUsageBucket[] | undefined) {
  if (buckets === undefined) {
    // Clear user override: rebuild object without userBuckets property
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
.left-pane {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0;
  border-right: 1px solid #2a2a2a;
}

.pane-section {
  padding: 0.75rem;
  border-bottom: 1px solid #222;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.section-title {
  font-size: 0.75rem;
  font-weight: 600;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.icon-btn {
  background: none;
  border: 1px solid #333;
  color: #888;
  border-radius: 4px;
  width: 22px;
  height: 22px;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.icon-btn:hover:not(:disabled) { background: #222; color: #ccc; }
.icon-btn:disabled { opacity: 0.3; cursor: default; }
.icon-btn.active { background: #1e3d52; border-color: #2a5070; color: #7ec8e3; }

.ep-list, .model-list { display: flex; flex-direction: column; gap: 0.5rem; }

.empty-hint { font-size: 0.75rem; color: #555; margin: 0; }

.model-row {
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  border-radius: 6px;
  padding: 0.5rem 0.6rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.model-row-header { display: flex; justify-content: space-between; align-items: center; }
.model-name { font-size: 0.82rem; font-weight: 500; }
.model-source { font-size: 0.68rem; padding: 1px 5px; border-radius: 3px; }
.source-discovered { background: #1e2d1e; color: #6db86d; }
.source-manual { background: #2d2a1e; color: #c8a85a; }
</style>
