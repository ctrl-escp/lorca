import {defineStore} from 'pinia';
import {ref} from 'vue';
import type {AiEndpointConfig, EndpointSecretRef} from '@lorca/core';
import {getDb} from '@lorca/storage';

export const useEndpointsStore = defineStore('endpoints', () => {
  const endpoints = ref<AiEndpointConfig[]>([]);
  const secretRefs = ref<EndpointSecretRef[]>([]);
  const loaded = ref(false);

  async function load() {
    if (loaded.value) return;
    endpoints.value = await getDb().endpoints.toArray();
    loaded.value = true;
  }

  async function addEndpoint(config: AiEndpointConfig) {
    await getDb().endpoints.put(config);
    const existing = endpoints.value.findIndex((e) => e.id === config.id);
    if (existing !== -1) {
      endpoints.value[existing] = config;
    } else {
      endpoints.value.push(config);
    }
  }

  async function updateEndpoint(id: string, patch: Partial<AiEndpointConfig>) {
    const idx = endpoints.value.findIndex((e) => e.id === id);
    if (idx === -1) return;
    const updated = {...endpoints.value[idx]!, ...patch, updatedAt: new Date().toISOString()};
    await getDb().endpoints.put(updated);
    endpoints.value[idx] = updated;
  }

  async function removeEndpoint(id: string) {
    await getDb().endpoints.delete(id);
    endpoints.value = endpoints.value.filter((e) => e.id !== id);
  }

  function getEndpoint(id: string): AiEndpointConfig | undefined {
    return endpoints.value.find((e) => e.id === id);
  }

  return {endpoints, secretRefs, loaded, load, addEndpoint, updateEndpoint, removeEndpoint, getEndpoint};
});
