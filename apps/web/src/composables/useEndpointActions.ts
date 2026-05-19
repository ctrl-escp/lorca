import {ref} from 'vue';
import {testBrowserAccess, listModels} from '@lorca/endpoints';
import type {AiEndpointConfig} from '@lorca/core';
import {useEndpointsStore} from '../stores/endpoints.js';
import {useModelsStore} from '../stores/models.js';
import {useUiStore} from '../stores/ui.js';

export function useEndpointActions() {
  const endpointsStore = useEndpointsStore();
  const modelsStore = useModelsStore();
  const uiStore = useUiStore();
  const testing = ref<Set<string>>(new Set());
  const discovering = ref<Set<string>>(new Set());

  async function testAccess(config: AiEndpointConfig) {
    testing.value = new Set([...testing.value, config.id]);
    try {
      const result = await testBrowserAccess(config);
      await endpointsStore.updateEndpoint(config.id, {
        browserAccess: result.ok ? 'available' : 'blocked',
      });
      return result;
    } finally {
      const next = new Set(testing.value);
      next.delete(config.id);
      testing.value = next;
    }
  }

  async function discoverModels(config: AiEndpointConfig) {
    discovering.value = new Set([...discovering.value, config.id]);
    try {
      const result = await listModels(config);
      if (result.ok) {
        await modelsStore.setModelsForEndpoint(config.id, result.value);
        uiStore.expandLeftPaneSection('models');
      }
      return result;
    } finally {
      const next = new Set(discovering.value);
      next.delete(config.id);
      discovering.value = next;
    }
  }

  return {
    testing,
    discovering,
    testAccess,
    discoverModels,
  };
}
