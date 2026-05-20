import {defineStore} from 'pinia';
import {ref, computed} from 'vue';
import type {PipelineDefinition, LegacyPipelineDefinition} from '@lorca/core';
import {getDb} from '@lorca/storage';
import {migrateLegacyPipeline} from '@lorca/pipeline';
import {cloneForStorage} from '../utils/storage.js';
import {newId} from '../utils/id.js';

export function createDefaultPipeline(preserveId?: string): PipelineDefinition {
  const now = new Date().toISOString();
  const id = preserveId ?? newId('pipeline');
  const modelStepId = newId('model_call');
  return {
    schemaVersion: 2,
    id,
    name: 'New Pipeline',
    input: {raw: '', tagName: 'user', outputNamespace: 'user_prompt'},
    steps: [
      {
        id: modelStepId,
        type: 'model-call',
        label: 'Model Call',
        enabled: true,
        outputNamespace: 'answer',
        primaryOutputName: 'text',
        lastEditedAt: now,
        config: {
          type: 'model-call',
          modelRef: {kind: 'fixed', endpointId: '', modelName: ''},
          mode: 'generate',
          outputNames: ['text', 'rawResponse'],
        },
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

function isLegacyPipeline(def: unknown): def is LegacyPipelineDefinition {
  return (
    typeof def === 'object' &&
    def !== null &&
    (def as {schemaVersion?: unknown}).schemaVersion === 1 &&
    'nodes' in def
  );
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
      // Migrate any V1 pipelines on load
      const migrated = stored.map((p) =>
        isLegacyPipeline(p) ? migrateLegacyPipeline(p) : p as PipelineDefinition,
      );
      pipelines.value = migrated;
      activePipelineId.value = migrated[0]!.id;
    } else {
      const def = createDefaultPipeline();
      await getDb().pipelines.put(cloneForStorage(def));
      pipelines.value = [def];
      activePipelineId.value = def.id;
    }
    loaded.value = true;
  }

  async function save(def: PipelineDefinition) {
    const plain = cloneForStorage(def);
    const idx = pipelines.value.findIndex((p) => p.id === plain.id);
    if (idx !== -1) {
      pipelines.value[idx] = plain;
    } else {
      pipelines.value.push(plain);
      if (!activePipelineId.value) activePipelineId.value = plain.id;
    }
    await getDb().pipelines.put(plain);
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

  async function resetActivePipeline(): Promise<PipelineDefinition | null> {
    const id = activePipelineId.value;
    if (!id) return null;
    const def = createDefaultPipeline(id);
    await save(def);
    return def;
  }

  async function addNewPipeline(): Promise<PipelineDefinition> {
    const def = createDefaultPipeline();
    await save(def);
    activePipelineId.value = def.id;
    return def;
  }

  return {pipelines, activePipelineId, activePipeline, loaded, load, save, addPipeline, updatePipeline, removePipeline, setActive, resetActivePipeline, addNewPipeline};
});
