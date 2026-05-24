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
  const actionErrors = ref<Map<string, string>>(new Map());

  function clearActionError(id: string) {
    if (!actionErrors.value.has(id)) return;
    const next = new Map(actionErrors.value);
    next.delete(id);
    actionErrors.value = next;
  }

  function setActionError(id: string, message: string) {
    const next = new Map(actionErrors.value);
    next.set(id, message);
    actionErrors.value = next;
  }

  async function testAccess(config: AiEndpointConfig) {
    clearActionError(config.id);
    testing.value = new Set([...testing.value, config.id]);
    try {
      const result = await testBrowserAccess(config);
      await endpointsStore.updateEndpoint(config.id, {
        browserAccess: result.ok ? 'available' : 'blocked',
      });
      if (!result.ok) {
        setActionError(config.id, result.error.message);
      }
      return result;
    } finally {
      const next = new Set(testing.value);
      next.delete(config.id);
      testing.value = next;
    }
  }

  async function discoverModels(config: AiEndpointConfig) {
    clearActionError(config.id);
    discovering.value = new Set([...discovering.value, config.id]);
    try {
      const result = await listModels(config);
      if (result.ok) {
        await modelsStore.setModelsForEndpoint(config.id, result.value);
        uiStore.expandLeftPaneSection('models');
      } else {
        setActionError(config.id, result.error.message);
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
    actionErrors,
    testAccess,
    discoverModels,
  };
}
