import {defineStore} from 'pinia';
import {ref, computed} from 'vue';
import type {PipelineDefinition} from '@lorca/core';
import {getDb} from '@lorca/storage';
import {newId} from '../utils/id.js';
import {cloneForStorage} from '../utils/storage.js';

function makeDefaultPipeline(): PipelineDefinition {
  const inputId = newId('input');
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: newId('pipeline'),
    name: 'New Pipeline',
    inputArtifactName: 'user_prompt',
    nodes: [{id: inputId, type: 'input'}],
    edges: [],
    outputRef: {nodeId: inputId, outputName: 'xml'},
    createdAt: now,
    updatedAt: now,
  };
}

export const usePipelinesStore = defineStore('pipelines', () => {
  const pipelines = ref<PipelineDefinition[]>([]);
  const activePipelineId = ref<string | null>(null);
  const loaded = ref(false);

  const activePipeline = computed(() =>
    activePipelineId.value !== null
      ? pipelines.value.find((p) => p.id === activePipelineId.value)
      : undefined,
  );

  async function load() {
    if (loaded.value) return;
    const stored = await getDb().pipelines.toArray();
    if (stored.length > 0) {
      pipelines.value = stored;
      activePipelineId.value = stored[0]!.id;
    } else {
      const def = makeDefaultPipeline();
      await getDb().pipelines.put(def);
      pipelines.value = [def];
      activePipelineId.value = def.id;
    }
    loaded.value = true;
  }

  async function save(def: PipelineDefinition) {
    const plain = cloneForStorage(def);
    await getDb().pipelines.put(plain);
    const idx = pipelines.value.findIndex((p) => p.id === plain.id);
    if (idx !== -1) {
      pipelines.value[idx] = plain;
    } else {
      pipelines.value.push(plain);
      if (!activePipelineId.value) activePipelineId.value = plain.id;
    }
  }

  function addPipeline(pipeline: PipelineDefinition) {
    const plain = cloneForStorage(pipeline);
    pipelines.value.push(plain);
    void getDb().pipelines.put(plain);
  }

  function updatePipeline(id: string, patch: Partial<PipelineDefinition>) {
    const idx = pipelines.value.findIndex((p) => p.id === id);
    if (idx !== -1) {
      const updated = cloneForStorage({...pipelines.value[idx]!, ...patch, updatedAt: new Date().toISOString()});
      pipelines.value[idx] = updated;
      void getDb().pipelines.put(updated);
    }
  }

  function removePipeline(id: string) {
    pipelines.value = pipelines.value.filter((p) => p.id !== id);
    if (activePipelineId.value === id) activePipelineId.value = null;
    void getDb().pipelines.delete(id);
  }

  function setActive(id: string | null) {
    activePipelineId.value = id;
  }

  return {pipelines, activePipelineId, activePipeline, loaded, load, save, addPipeline, updatePipeline, removePipeline, setActive};
});
