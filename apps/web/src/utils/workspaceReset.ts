import type {PipelineDefinition} from '@lorca/core';
import {useCapsulesStore} from '../stores/capsules.js';
import {useEndpointsStore} from '../stores/endpoints.js';
import {useModelsStore} from '../stores/models.js';
import {usePipelinesStore} from '../stores/pipelines.js';
import {clearAllRunHistory} from './runPersistence.js';

/** Wipe user data and restore default pipeline + disabled Local Ollama endpoint. */
export async function resetWorkspace(): Promise<PipelineDefinition> {
  const pipelinesStore = usePipelinesStore();
  const capsulesStore = useCapsulesStore();
  const endpointsStore = useEndpointsStore();
  const modelsStore = useModelsStore();

  await Promise.all([
    capsulesStore.clearAllUserCapsules(),
    modelsStore.clearAllModels(),
    endpointsStore.resetToDefault(),
  ]);
  clearAllRunHistory();
  return pipelinesStore.clearAllPipelines();
}
