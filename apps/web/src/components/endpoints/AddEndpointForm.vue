<template>
  <form class="add-ep-form" @submit.prevent="submit">
    <div class="form-row">
      <FieldLabel label="Name" required title="Friendly label for this endpoint in Lorca" />
      <input v-model="form.name" placeholder="Local Ollama" required title="Friendly label for this endpoint in Lorca" />
    </div>
    <div class="form-row">
      <FieldLabel label="Base URL" required title="Root URL of the AI server (e.g. Ollama at localhost:11434)" />
      <input v-model="form.baseUrl" placeholder="http://localhost:11434" required title="Root URL of the AI server (e.g. Ollama at localhost:11434)" />
    </div>
    <div class="form-row">
      <FieldLabel label="Type" title="Adapter used to talk to this server" />
      <select v-model="form.kind" title="Adapter used to talk to this server">
        <option value="ollama">Ollama</option>
        <option value="openai-compatible">OpenAI-compatible</option>
        <option value="lmstudio">LM Studio</option>
        <option value="custom-http">Custom HTTP</option>
      </select>
    </div>
    <div class="form-row">
      <FieldLabel label="Auth" title="Authentication method for API requests" />
      <select v-model="form.authKind" title="Authentication method for API requests">
        <option value="none">None</option>
        <option value="bearer-token">Bearer token</option>
        <option value="api-key">API key</option>
      </select>
    </div>
    <div class="form-actions">
      <button type="button" class="btn" title="Discard and close the form" @click="$emit('cancel')">Cancel</button>
      <button type="submit" class="btn btn-primary" title="Save this endpoint configuration">Add endpoint</button>
    </div>
  </form>
</template>

<script setup lang="ts">
import {reactive} from 'vue';
import type {AiEndpointConfig} from '@lorca/core';
import {newId} from '../../utils/id.js';
import FieldLabel from '../common/FieldLabel.vue';

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
