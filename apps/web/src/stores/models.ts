import {defineStore} from 'pinia';
import {ref, computed} from 'vue';
import type {DiscoveredModel, ModelUsageBucket} from '@lorca/core';

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

  function addModel(model: DiscoveredModel) {
    const existing = models.value.findIndex((m) => m.id === model.id);
    if (existing !== -1) {
      models.value[existing] = model;
    } else {
      models.value.push(model);
    }
  }

  function setModelsForEndpoint(endpointId: string, discovered: DiscoveredModel[]) {
    models.value = [
      ...models.value.filter((m) => m.endpointId !== endpointId),
      ...discovered,
    ];
  }

  function setUserBuckets(modelId: string, buckets: ModelUsageBucket[]) {
    const m = models.value.find((m) => m.id === modelId);
    if (m) m.userBuckets = buckets;
  }

  function removeModelsForEndpoint(endpointId: string) {
    models.value = models.value.filter((m) => m.endpointId !== endpointId);
  }

  return {models, modelsByEndpoint, addModel, setModelsForEndpoint, setUserBuckets, removeModelsForEndpoint};
});
