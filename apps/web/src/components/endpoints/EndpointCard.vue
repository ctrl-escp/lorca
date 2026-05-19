<template>
  <div class="ep-card" :class="`status-${endpoint.browserAccess}`">
    <div class="ep-card-header">
      <span class="ep-name">{{ endpoint.name }}</span>
      <span class="ep-badge" :class="`badge-${endpoint.browserAccess}`">
        {{ accessLabel }}
      </span>
    </div>
    <div class="ep-url">{{ endpoint.baseUrl }}</div>
    <div class="ep-meta">
      <span class="ep-kind">{{ endpoint.kind }}</span>
      <span class="ep-model-count" v-if="modelCount > 0">{{ modelCount }} model{{ modelCount !== 1 ? 's' : '' }}</span>
    </div>
    <div class="ep-actions">
      <button class="btn btn-sm" :disabled="isTesting" @click="$emit('test', endpoint)">
        {{ isTesting ? 'Testing…' : 'Test access' }}
      </button>
      <button class="btn btn-sm" :disabled="isDiscovering || endpoint.browserAccess !== 'available'" @click="$emit('discover', endpoint)">
        {{ isDiscovering ? 'Discovering…' : 'Discover models' }}
      </button>
      <button class="btn btn-sm btn-danger" @click="$emit('remove', endpoint.id)">Remove</button>
    </div>
    <div v-if="endpoint.browserAccess === 'blocked'" class="ep-cors-warn">
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
}>();

defineEmits<{
  test: [ep: AiEndpointConfig];
  discover: [ep: AiEndpointConfig];
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
  border-radius: 6px;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.ep-card.status-available { border-left: 3px solid #3a9d6e; }
.ep-card.status-blocked { border-left: 3px solid #c0392b; }
.ep-card.status-unknown { border-left: 3px solid #555; }

.ep-card-header { display: flex; justify-content: space-between; align-items: center; }
.ep-name { font-weight: 600; font-size: 0.9rem; }
.ep-badge { font-size: 0.7rem; padding: 2px 6px; border-radius: 3px; }
.badge-available { background: #1e4d37; color: #5ddb9e; }
.badge-blocked { background: #4d1e1e; color: #e07070; }
.badge-unknown { background: #333; color: #999; }

.ep-url { font-size: 0.75rem; color: #888; font-family: monospace; }
.ep-meta { display: flex; gap: 0.75rem; font-size: 0.75rem; color: #666; }
.ep-actions { display: flex; gap: 0.4rem; flex-wrap: wrap; margin-top: 0.25rem; }

.ep-cors-warn {
  font-size: 0.75rem;
  color: #e07070;
  background: #2d1a1a;
  border-radius: 4px;
  padding: 0.4rem 0.6rem;
}

.btn {
  background: #2a2a2a;
  border: 1px solid #3a3a3a;
  color: #ccc;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 0.75rem;
  cursor: pointer;
}
.btn:hover:not(:disabled) { background: #333; }
.btn:disabled { opacity: 0.4; cursor: default; }
.btn-danger { color: #e07070; }
.btn-danger:hover:not(:disabled) { background: #2d1a1a; }
</style>
