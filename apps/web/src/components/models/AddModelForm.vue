<template>
  <form class="add-model-form" @submit.prevent="submit">
    <div class="form-row">
      <FieldLabel label="Model name (as shown by the endpoint)" required title="Exact model identifier returned by the endpoint API" />
      <input v-model="form.providerModelName" placeholder="llama3.2:3b" required title="Exact model identifier returned by the endpoint API" />
    </div>
    <div class="form-row">
      <FieldLabel label="Display name (optional)" title="Human-readable name shown in Lorca (defaults to model name)" />
      <input v-model="form.displayName" placeholder="Llama 3.2 3B" title="Human-readable name shown in Lorca (defaults to model name)" />
    </div>
    <div class="form-row">
      <FieldLabel label="Endpoint" required title="Which endpoint hosts this model" />
      <select v-model="form.endpointId" required title="Which endpoint hosts this model">
        <option v-for="ep in endpoints" :key="ep.id" :value="ep.id">{{ ep.name }}</option>
      </select>
    </div>
    <div class="form-row">
      <FieldLabel label="Parameter size (optional, e.g. 7b)" title="Used to auto-assign usage buckets (tiny, thinking, etc.)" />
      <input v-model="form.parameterSize" placeholder="7b" title="Used to auto-assign usage buckets (tiny, thinking, etc.)" />
    </div>
    <div class="form-actions">
      <button type="button" class="btn" title="Discard and close the form" @click="$emit('cancel')">Cancel</button>
      <button type="submit" class="btn btn-primary" title="Add this model to the library">Add model</button>
    </div>
  </form>
</template>

<script setup lang="ts">
import {reactive} from 'vue';
import type {AiEndpointConfig, DiscoveredModel} from '@lorca/core';
import {assignBuckets} from '@lorca/endpoints';
import {FieldLabel} from '@lorca/ui-kit';

const props = defineProps<{endpoints: AiEndpointConfig[]}>();
const emit = defineEmits<{add: [model: DiscoveredModel]; cancel: []}>();

const form = reactive({
  providerModelName: '',
  displayName: '',
  endpointId: props.endpoints[0]?.id ?? '',
  parameterSize: '',
});

function submit() {
  const name = form.providerModelName.trim();
  const paramSize = form.parameterSize.trim() || undefined;
  const model: DiscoveredModel = {
    id: `${form.endpointId}::${name}`,
    endpointId: form.endpointId,
    providerModelName: name,
    displayName: form.displayName.trim() || name,
    buckets: assignBuckets({
      providerModelName: name,
      ...(paramSize !== undefined && {parameterSize: paramSize}),
    }),
    source: 'manual',
    ...(paramSize !== undefined && {parameterSize: paramSize}),
  };
  emit('add', model);
  form.providerModelName = '';
  form.displayName = '';
  form.parameterSize = '';
}
</script>

<style scoped>
.add-model-form { display: flex; flex-direction: column; gap: 0.6rem; padding: 0.75rem; background: #1a1a1a; border: 1px solid #333; border-radius: 6px; }
.form-row { display: flex; flex-direction: column; gap: 0.2rem; }
.form-row input, .form-row select { background: #111; border: 1px solid #333; color: #e8e8e8; border-radius: 4px; padding: 4px 8px; font-size: 0.85rem; }
.form-row input:focus, .form-row select:focus { outline: none; border-color: var(--text-secondary); }
.form-actions { display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 0.25rem; }
.btn { background: #2a2a2a; border: 1px solid #3a3a3a; color: #ccc; border-radius: 4px; padding: 4px 12px; font-size: 0.8rem; cursor: pointer; }
.btn:hover { background: #333; }
.btn-primary { background: var(--accent-bg); border-color: var(--accent-border); color: var(--accent); }
.btn-primary:hover { background: var(--accent-bg-hover); }
</style>
