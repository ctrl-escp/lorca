import {defineStore} from 'pinia';
import {ref} from 'vue';
import type {AiEndpointConfig, EndpointSecretRef} from '@lorca/core';

export const useEndpointsStore = defineStore('endpoints', () => {
  const endpoints = ref<AiEndpointConfig[]>([]);
  const secretRefs = ref<EndpointSecretRef[]>([]);

  function addEndpoint(config: AiEndpointConfig) {
    endpoints.value.push(config);
  }

  function updateEndpoint(id: string, patch: Partial<AiEndpointConfig>) {
    const idx = endpoints.value.findIndex((e) => e.id === id);
    if (idx !== -1) {
      endpoints.value[idx] = {...endpoints.value[idx]!, ...patch};
    }
  }

  function removeEndpoint(id: string) {
    endpoints.value = endpoints.value.filter((e) => e.id !== id);
  }

  function getEndpoint(id: string): AiEndpointConfig | undefined {
    return endpoints.value.find((e) => e.id === id);
  }

  return {endpoints, secretRefs, addEndpoint, updateEndpoint, removeEndpoint, getEndpoint};
});
