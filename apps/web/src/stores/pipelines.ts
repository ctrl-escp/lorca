import {defineStore} from 'pinia';
import {ref} from 'vue';
import type {PipelineDefinition} from '@lorca/core';

export const usePipelinesStore = defineStore('pipelines', () => {
  const pipelines = ref<PipelineDefinition[]>([]);
  const activePipelineId = ref<string | null>(null);

  const activePipeline = (): PipelineDefinition | undefined =>
    activePipelineId.value != null
      ? pipelines.value.find((p) => p.id === activePipelineId.value)
      : undefined;

  function addPipeline(pipeline: PipelineDefinition) {
    pipelines.value.push(pipeline);
  }

  function updatePipeline(id: string, patch: Partial<PipelineDefinition>) {
    const idx = pipelines.value.findIndex((p) => p.id === id);
    if (idx !== -1) {
      pipelines.value[idx] = {...pipelines.value[idx]!, ...patch, updatedAt: new Date().toISOString()};
    }
  }

  function removePipeline(id: string) {
    pipelines.value = pipelines.value.filter((p) => p.id !== id);
    if (activePipelineId.value === id) activePipelineId.value = null;
  }

  function setActive(id: string | null) {
    activePipelineId.value = id;
  }

  return {pipelines, activePipelineId, activePipeline, addPipeline, updatePipeline, removePipeline, setActive};
});
