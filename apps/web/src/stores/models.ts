import {defineStore} from 'pinia';
import {ref, computed} from 'vue';
import type {DiscoveredModel, ModelUsageBucket} from '@lorca/core';
import {getDb} from '@lorca/storage';

export const useModelsStore = defineStore('models', () => {
  const models = ref<DiscoveredModel[]>([]);

  const modelsByEndpoint = computed(() => {
    const map = new Map<string, DiscoveredModel[]>();
    for (const m of models.value) {
      const list = map.get(m.endpointId) ?? [];
      list.push(m);
      map.set(m.endpointId, list);
    }
    return map;
  });

  async function load() {
    models.value = await getDb().models.toArray();
  }

  async function addModel(model: DiscoveredModel) {
    await getDb().models.put(model);
    const existing = models.value.findIndex((m) => m.id === model.id);
    if (existing !== -1) {
      models.value[existing] = model;
    } else {
      models.value.push(model);
    }
  }

  async function setModelsForEndpoint(endpointId: string, discovered: DiscoveredModel[]) {
    await getDb().models.where('endpointId').equals(endpointId).delete();
    await getDb().models.bulkPut(discovered);
    models.value = [
      ...models.value.filter((m) => m.endpointId !== endpointId),
      ...discovered,
    ];
  }

  async function setUserBuckets(modelId: string, buckets: ModelUsageBucket[]) {
    const model = models.value.find((entry) => entry.id === modelId);
    if (!model) return;
    const updated = {...model, userBuckets: buckets};
    await getDb().models.put(updated);
    const idx = models.value.findIndex((entry) => entry.id === modelId);
    if (idx !== -1) models.value[idx] = updated;
  }

  async function removeModelsForEndpoint(endpointId: string) {
    await getDb().models.where('endpointId').equals(endpointId).delete();
    models.value = models.value.filter((m) => m.endpointId !== endpointId);
  }

  return {models, modelsByEndpoint, load, addModel, setModelsForEndpoint, setUserBuckets, removeModelsForEndpoint};
});
