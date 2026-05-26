import {defineStore} from 'pinia';
import {ref} from 'vue';
import type {AiEndpointConfig, EndpointSecretRef} from '@lorca/core';
import {getDb} from '@lorca/storage';
import {cloneForStorage} from '../utils/storage.js';
import {newId} from '../utils/id.js';

export function createDefaultEndpoint(preserveId?: string): AiEndpointConfig {
  const now = new Date().toISOString();
  return {
    id: preserveId ?? newId('ep'),
    name: 'Local Ollama',
    baseUrl: 'http://127.0.0.1:11434',
    kind: 'ollama',
    enabled: false,
    browserAccess: 'unknown',
    authKind: 'none',
    createdAt: now,
    updatedAt: now,
  };
}

export const useEndpointsStore = defineStore('endpoints', () => {
  const endpoints = ref<AiEndpointConfig[]>([]);
  const secretRefs = ref<EndpointSecretRef[]>([]);
  const loaded = ref(false);

  async function load() {
    if (loaded.value) return;
    const stored = await getDb().endpoints.toArray();
    if (stored.length > 0) {
      endpoints.value = stored;
    } else {
      const def = createDefaultEndpoint();
      await getDb().endpoints.put(cloneForStorage(def));
      endpoints.value = [def];
    }
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

  async function resetToDefault(): Promise<AiEndpointConfig> {
    await getDb().endpoints.clear();
    const def = createDefaultEndpoint();
    await getDb().endpoints.put(cloneForStorage(def));
    endpoints.value = [def];
    secretRefs.value = [];
    return def;
  }

  function getEndpoint(id: string): AiEndpointConfig | undefined {
    return endpoints.value.find((e) => e.id === id);
  }

  return {endpoints, secretRefs, loaded, load, addEndpoint, updateEndpoint, removeEndpoint, resetToDefault, getEndpoint};
});
