<template>
  <div class="ep-card" :class="[`status-${endpoint.browserAccess}`, {disabled: !endpoint.enabled}]" :title="`${endpoint.name} — ${endpoint.baseUrl} (${accessLabel})`">
    <div class="ep-card-header">
      <span class="ep-name">{{ endpoint.name }}</span>
      <div class="ep-header-badges">
        <span v-if="!endpoint.enabled" class="ep-badge badge-disabled">Disabled</span>
        <span class="ep-badge" :class="`badge-${endpoint.browserAccess}`">{{ accessLabel }}</span>
      </div>
    </div>
    <div class="ep-url">{{ endpoint.baseUrl }}</div>
    <div class="ep-meta">
      <span class="ep-kind">{{ endpoint.kind }}</span>
      <span class="ep-model-count" v-if="modelCount > 0">{{ modelCount }} model{{ modelCount !== 1 ? 's' : '' }}</span>
    </div>
    <div class="ep-actions">
      <button class="btn btn-sm" :disabled="!endpoint.enabled || isTesting" title="Check whether the browser can reach this endpoint (CORS)" @click="$emit('test', endpoint)">
        {{ isTesting ? 'Testing…' : 'Test access' }}
      </button>
      <button class="btn btn-sm" :disabled="!endpoint.enabled || isDiscovering || endpoint.browserAccess !== 'available'" title="Fetch the model list from this endpoint" @click="$emit('discover', endpoint)">
        {{ isDiscovering ? 'Discovering…' : 'Discover models' }}
      </button>
      <button class="btn btn-sm" title="Edit this endpoint's name, URL, type, or auth" @click="$emit('edit', endpoint)">Edit</button>
      <button
        class="btn btn-sm"
        :class="endpoint.enabled ? 'btn-muted' : 'btn-enable'"
        :title="endpoint.enabled ? 'Disable this endpoint (models will not be auto-assigned)' : 'Enable this endpoint'"
        @click="$emit('toggle', endpoint.id)"
      >{{ endpoint.enabled ? 'Disable' : 'Enable' }}</button>
      <button class="btn btn-sm btn-danger" title="Remove this endpoint and its discovered models" @click="$emit('remove', endpoint.id)">Remove</button>
    </div>
    <div v-if="actionError" class="ep-action-error">{{ actionError }}</div>
    <div v-else-if="endpoint.browserAccess === 'blocked'" class="ep-cors-warn">
      Browser cannot reach this endpoint. Check CORS headers or use a local proxy.
    </div>
  </div>
</template>

<script setup lang="ts">
import type {AiEndpointConfig} from '@lorca/core';

const props = defineProps<{
  endpoint: AiEndpointConfig;
  modelCount: number;
  isTesting: boolean;
  isDiscovering: boolean;
  actionError?: string;
}>();

defineEmits<{
  test: [ep: AiEndpointConfig];
  discover: [ep: AiEndpointConfig];
  edit: [ep: AiEndpointConfig];
  toggle: [id: string];
  remove: [id: string];
}>();

const accessLabel = {
  unknown: 'Unknown',
  available: 'Available',
  blocked: 'Blocked',
}[props.endpoint.browserAccess];
</script>

<style scoped>
.ep-card {
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  border-radius: 7px;
  padding: 1rem 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}
.ep-card.status-available { border-left: 3px solid #3a9d6e; }
.ep-card.status-blocked { border-left: 3px solid #c0392b; }
.ep-card.status-unknown { border-left: 3px solid #555; }

.ep-card.disabled { opacity: 0.55; }
.ep-card-header { display: flex; justify-content: space-between; align-items: center; }
.ep-header-badges { display: flex; gap: 0.35rem; align-items: center; }
.ep-name { font-weight: 600; font-size: 1rem; }
.ep-badge { font-size: 0.78rem; padding: 3px 8px; border-radius: 4px; }
.badge-available { background: #1e4d37; color: #5ddb9e; }
.badge-blocked { background: #4d1e1e; color: #e07070; }
.badge-unknown { background: #333; color: #999; }
.badge-disabled { background: #2a2010; color: #b89a50; }

.ep-url { font-size: 0.82rem; color: var(--text-label); font-family: monospace; }
.ep-meta { display: flex; gap: 0.85rem; font-size: 0.82rem; color: var(--text-label); }
.ep-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.1rem; }

.ep-cors-warn,
.ep-action-error {
  font-size: 0.82rem;
  color: #e07070;
  background: #2d1a1a;
  border-radius: 5px;
  padding: 0.5rem 0.75rem;
}

.btn {
  background: #2a2a2a;
  border: 1px solid #3a3a3a;
  color: #ccc;
  border-radius: 5px;
  padding: 5px 11px;
  font-size: 0.82rem;
  cursor: pointer;
}
.btn:hover:not(:disabled) { background: #333; }
.btn:disabled { opacity: 0.4; cursor: default; }
.btn-danger { color: #e07070; }
.btn-danger:hover:not(:disabled) { background: #2d1a1a; }
.btn-muted { color: var(--text-label); }
.btn-enable { color: #5ddb9e; border-color: #1e4d37; }
.btn-enable:hover:not(:disabled) { background: #1a2d22; }
</style>
