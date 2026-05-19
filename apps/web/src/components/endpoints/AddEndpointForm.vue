<template>
  <form class="add-ep-form" @submit.prevent="submit">
    <div class="form-row">
      <label>Name</label>
      <input v-model="form.name" placeholder="Local Ollama" required />
    </div>
    <div class="form-row">
      <label>Base URL</label>
      <input v-model="form.baseUrl" placeholder="http://localhost:11434" required />
    </div>
    <div class="form-row">
      <label>Type</label>
      <select v-model="form.kind">
        <option value="ollama">Ollama</option>
        <option value="openai-compatible">OpenAI-compatible</option>
        <option value="lmstudio">LM Studio</option>
        <option value="custom-http">Custom HTTP</option>
      </select>
    </div>
    <div class="form-row">
      <label>Auth</label>
      <select v-model="form.authKind">
        <option value="none">None</option>
        <option value="bearer-token">Bearer token</option>
        <option value="api-key">API key</option>
      </select>
    </div>
    <div class="form-actions">
      <button type="button" class="btn" @click="$emit('cancel')">Cancel</button>
      <button type="submit" class="btn btn-primary">Add endpoint</button>
    </div>
  </form>
</template>

<script setup lang="ts">
import {reactive} from 'vue';
import type {AiEndpointConfig} from '@lorca/core';
import {newId} from '../../utils/id.js';

const emit = defineEmits<{ add: [config: AiEndpointConfig]; cancel: [] }>();

const form = reactive({
  name: '',
  baseUrl: '',
  kind: 'ollama' as AiEndpointConfig['kind'],
  authKind: 'none' as AiEndpointConfig['authKind'],
});

function submit() {
  const now = new Date().toISOString();
  const config: AiEndpointConfig = {
    id: newId('ep'),
    name: form.name.trim(),
    baseUrl: form.baseUrl.trim().replace(/\/$/, ''),
    kind: form.kind,
    enabled: true,
    browserAccess: 'unknown',
    authKind: form.authKind,
    createdAt: now,
    updatedAt: now,
  };
  emit('add', config);
  form.name = '';
  form.baseUrl = '';
  form.kind = 'ollama';
  form.authKind = 'none';
}
</script>

<style scoped>
.add-ep-form { display: flex; flex-direction: column; gap: 0.6rem; padding: 0.75rem; background: #1a1a1a; border: 1px solid #333; border-radius: 6px; }
.form-row { display: flex; flex-direction: column; gap: 0.2rem; }
.form-row label { font-size: 0.75rem; color: #888; }
.form-row input, .form-row select {
  background: #111;
  border: 1px solid #333;
  color: #e8e8e8;
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 0.85rem;
}
.form-row input:focus, .form-row select:focus { outline: none; border-color: #555; }
.form-actions { display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 0.25rem; }
.btn { background: #2a2a2a; border: 1px solid #3a3a3a; color: #ccc; border-radius: 4px; padding: 4px 12px; font-size: 0.8rem; cursor: pointer; }
.btn:hover { background: #333; }
.btn-primary { background: #1e3d52; border-color: #2a5070; color: #7ec8e3; }
.btn-primary:hover { background: #254a62; }
</style>
