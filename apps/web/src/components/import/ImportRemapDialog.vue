<template>
  <div v-if="open" class="dialog-backdrop" @click.self="emit('cancel')">
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="import-title">
      <header class="dialog-header">
        <h2 id="import-title">Import {{ kindLabel }}</h2>
        <button class="dialog-close" type="button" title="Close without importing" @click="emit('cancel')">×</button>
      </header>

      <div class="dialog-body">
        <p v-if="replacesActivePipeline" class="warning">
          This will replace your current pipeline and clear the undo history. Run results will be reset.
        </p>
        <p v-if="missingModels.length === 0" class="hint">
          All model references resolve locally. Click Import to add this {{ kindLabel }}.
        </p>
        <p v-else class="hint">
          Some model references from the export are missing locally. Remap them before importing.
        </p>

        <div v-for="ref in missingModels" :key="ref.key" class="remap-row">
          <div class="remap-label">
            <span class="remap-title">{{ ref.label }}</span>
            <span class="remap-meta">{{ ref.endpointId }} / {{ ref.modelName }}</span>
          </div>
          <select v-model="localRemaps[ref.key]" :title="`Choose a local model to replace ${ref.modelName}`">
            <option value="">— select local model —</option>
            <template v-if="modelsForRemap(ref).relevant.length > 0">
              <optgroup :label="suggestedGroupLabel(ref.suggestedBuckets)">
                <option
                  v-for="m in modelsForRemap(ref).relevant"
                  :key="m.id"
                  class="option-relevant"
                  :value="`${m.endpointId}::${m.providerModelName}`"
                >
                  {{ modelOptionLabel(m) }}
                </option>
              </optgroup>
              <optgroup v-if="modelsForRemap(ref).other.length > 0" label="Other models">
                <option
                  v-for="m in modelsForRemap(ref).other"
                  :key="m.id"
                  :value="`${m.endpointId}::${m.providerModelName}`"
                >
                  {{ modelOptionLabel(m) }}
                </option>
              </optgroup>
            </template>
            <template v-else>
              <option
                v-for="m in models"
                :key="m.id"
                :value="`${m.endpointId}::${m.providerModelName}`"
              >
                {{ modelOptionLabel(m) }}
              </option>
            </template>
          </select>
        </div>
      </div>

      <footer class="dialog-footer">
        <button class="btn btn-secondary" type="button" title="Close without importing" @click="emit('cancel')">Cancel</button>
        <button class="btn btn-primary" type="button" :disabled="!canConfirm" title="Import with the selected model mappings" @click="confirm">
          Import
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed, reactive, watch} from 'vue';
import type {DiscoveredModel, AiEndpointConfig, ModelUsageBucket} from '@lorca/core';
import {partitionModelsByBuckets} from '@lorca/endpoints';
import type {MissingModelReference, ModelRemap} from '../../stores/importExport.js';

const props = defineProps<{
  open: boolean;
  kind: 'pipeline' | 'capsule';
  missingModels: MissingModelReference[];
  models: DiscoveredModel[];
  endpoints: AiEndpointConfig[];
  /** When importing a pipeline into the active editor, warn before overwrite. */
  replacesActivePipeline?: boolean;
}>();

const emit = defineEmits<{
  cancel: [];
  confirm: [remaps: Record<string, ModelRemap>];
}>();

const localRemaps = reactive<Record<string, string>>({});

watch(
  () => props.missingModels,
  (refs) => {
    for (const key of Object.keys(localRemaps)) delete localRemaps[key];
    for (const ref of refs) localRemaps[ref.key] = '';
  },
  {immediate: true},
);

const kindLabel = computed(() => props.kind === 'pipeline' ? 'pipeline' : 'Capsule');

const canConfirm = computed(() =>
  props.missingModels.every((ref) => (localRemaps[ref.key] ?? '').length > 0),
);

function endpointName(id: string): string {
  return props.endpoints.find((e) => e.id === id)?.name ?? id;
}

function modelOptionLabel(m: DiscoveredModel): string {
  return `${m.displayName} (${endpointName(m.endpointId)})`;
}

function modelsForRemap(ref: MissingModelReference) {
  return partitionModelsByBuckets(props.models, ref.suggestedBuckets);
}

function suggestedGroupLabel(buckets: ModelUsageBucket[]): string {
  if (buckets.length === 1) return `Suggested for this step (${buckets[0]})`;
  return `Suggested for this step (${buckets.join(', ')})`;
}

function confirm() {
  const remaps: Record<string, ModelRemap> = {};
  for (const ref of props.missingModels) {
    const val = localRemaps[ref.key] ?? '';
    if (!val) continue;
    const parts = val.split('::');
    remaps[ref.key] = {endpointId: parts[0] ?? '', modelName: parts.slice(1).join('::')};
  }
  emit('confirm', remaps);
}
</script>

<style scoped>
.dialog-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.dialog {
  width: min(520px, calc(100vw - 2rem));
  max-height: calc(100vh - 4rem);
  background: #141414;
  border: 1px solid #333;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #222;
}
.dialog-header h2 { margin: 0; font-size: 0.95rem; }
.dialog-close {
  background: none;
  border: none;
  color: var(--text-label);
  font-size: 1.2rem;
  cursor: pointer;
}
.dialog-body {
  padding: 1rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.hint { margin: 0; font-size: 0.82rem; color: var(--text-label); }
.warning {
  margin: 0;
  font-size: 0.82rem;
  color: #c8a050;
  background: #1a180f;
  border: 1px solid #4a4020;
  border-radius: 4px;
  padding: 0.45rem 0.55rem;
}
.remap-row { display: flex; flex-direction: column; gap: 0.3rem; }
.remap-label { display: flex; flex-direction: column; gap: 0.1rem; }
.remap-title { font-size: 0.82rem; color: #ddd; }
.remap-meta { font-size: 0.72rem; color: var(--text-label); font-family: monospace; }
select {
  background: #111;
  border: 1px solid #2a2a2a;
  color: #e8e8e8;
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 0.82rem;
}
select option.option-relevant {
  color: #7ec8e3;
  background: #0d1e30;
}
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-top: 1px solid #222;
}
.btn {
  border-radius: 4px;
  padding: 4px 14px;
  font-size: 0.82rem;
  cursor: pointer;
  border: 1px solid #333;
}
.btn-secondary { background: #1a1a1a; color: #ccc; }
.btn-primary { background: #1e3d52; border-color: #2a5070; color: #7ec8e3; }
.btn-primary:disabled { opacity: 0.4; cursor: default; }
</style>
