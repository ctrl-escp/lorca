<template>
  <div class="bucket-editor">
    <div class="bucket-list">
      <label
        v-for="bucket in ALL_BUCKETS"
        :key="bucket"
        class="bucket-toggle"
        :class="{active: effective.includes(bucket)}"
      >
        <input
          type="checkbox"
          :checked="effective.includes(bucket)"
          @change="toggle(bucket)"
        />
        {{ bucket }}
      </label>
    </div>
    <button v-if="hasOverride" class="btn-reset" @click="reset">Reset to auto</button>
  </div>
</template>

<script setup lang="ts">
import {computed} from 'vue';
import type {DiscoveredModel, ModelUsageBucket} from '@lorca/core';

const ALL_BUCKETS: ModelUsageBucket[] = [
  'tiny', 'thinking', 'summarize', 'rewrite', 'extract-json', 'verify', 'general', 'unknown',
];

const props = defineProps<{model: DiscoveredModel}>();
const emit = defineEmits<{update: [buckets: ModelUsageBucket[] | undefined]}>();

const effective = computed(() => props.model.userBuckets ?? props.model.buckets);
const hasOverride = computed(() => props.model.userBuckets !== undefined);

function toggle(bucket: ModelUsageBucket) {
  const current = [...effective.value];
  const idx = current.indexOf(bucket);
  if (idx !== -1) {
    current.splice(idx, 1);
  } else {
    current.push(bucket);
  }
  emit('update', current.length > 0 ? current : ['unknown']);
}

function reset() {
  emit('update', undefined);
}
</script>

<style scoped>
.bucket-editor { display: flex; flex-direction: column; gap: 0.4rem; }
.bucket-list { display: flex; flex-wrap: wrap; gap: 0.3rem; }
.bucket-toggle {
  display: flex; align-items: center; gap: 0.25rem;
  font-size: 0.72rem;
  padding: 2px 6px;
  border-radius: 3px;
  border: 1px solid #333;
  background: #1a1a1a;
  color: #777;
  cursor: pointer;
  user-select: none;
}
.bucket-toggle input { display: none; }
.bucket-toggle.active { background: #1e3d52; border-color: #2a5070; color: #7ec8e3; }
.btn-reset { font-size: 0.72rem; color: #888; background: none; border: none; cursor: pointer; text-decoration: underline; align-self: flex-start; }
.btn-reset:hover { color: #aaa; }
</style>
