<template>
  <div class="bucket-editor" title="Usage buckets help Lorca suggest models for different tasks">
    <div class="bucket-tags">
      <span
        v-for="bucket in effective"
        :key="bucket"
        class="bucket-tag"
        :class="`bucket-${bucket}`"
        :title="`${BUCKET_TITLES[bucket]} — click to remove`"
        @click.stop="toggle(bucket)"
      >{{ bucket }}</span>
      <button class="bucket-add-btn" :class="{open: showAll}" title="Add / remove buckets" @click.stop="showAll = !showAll">+</button>
    </div>
    <div v-if="showAll" class="bucket-all">
      <label
        v-for="bucket in ALL_BUCKETS"
        :key="bucket"
        class="bucket-toggle"
        :class="{active: effective.includes(bucket), [`bucket-${bucket}`]: effective.includes(bucket)}"
        :title="BUCKET_TITLES[bucket]"
      >
        <input type="checkbox" :checked="effective.includes(bucket)" @change="toggle(bucket)" />
        {{ bucket }}
      </label>
    </div>
    <button v-if="hasOverride" class="btn-reset" title="Restore auto-assigned buckets from model metadata" @click.stop="reset">Reset to auto</button>
  </div>
</template>

<script setup lang="ts">
import {computed, ref} from 'vue';
import type {DiscoveredModel, ModelUsageBucket} from '@lorca/core';

const showAll = ref(false);

const ALL_BUCKETS: ModelUsageBucket[] = [
  'tiny', 'thinking', 'summarize', 'rewrite', 'rewrite-prose', 'rewrite-code', 'extract-json', 'verify', 'general', 'unknown',
];

const BUCKET_TITLES: Record<ModelUsageBucket, string> = {
  tiny: 'Small/fast models for lightweight tasks',
  thinking: 'Larger models for reasoning and complex generation',
  summarize: 'Models suited for summarization',
  rewrite: 'Models suited for rewriting and rephrasing',
  'rewrite-prose': 'Models suited for prose and prompt rewriting',
  'rewrite-code': 'Models suited for code rewriting and refactoring',
  'extract-json': 'Models suited for structured JSON extraction',
  verify: 'Models suited for verification and critique',
  general: 'General-purpose models',
  unknown: 'Uncategorized usage',
};

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
.bucket-editor { display: flex; flex-direction: column; gap: 0.35rem; }

/* Active tags row */
.bucket-tags { display: flex; flex-wrap: wrap; gap: 0.25rem; align-items: center; }

.bucket-tag {
  font-size: 0.65rem;
  padding: 1px 6px;
  border-radius: 3px;
  border: 1px solid;
  cursor: pointer;
  user-select: none;
  font-family: monospace;
  letter-spacing: 0.02em;
}
.bucket-tag:hover { filter: brightness(1.3); }

/* Per-bucket colors */
.bucket-tiny        { color: #4fc3c3; background: #0d2626; border-color: #1e4040; }
.bucket-thinking    { color: #a78bda; background: #1a1030; border-color: #3a2060; }
.bucket-summarize   { color: #e8a04e; background: #2a1a08; border-color: #4a3010; }
.bucket-rewrite     { color: #b0c840; background: #1a2008; border-color: #303810; }
.bucket-rewrite-prose { color: #c8d86a; background: #202608; border-color: #3a4412; }
.bucket-rewrite-code { color: #80b8f0; background: #101d2a; border-color: #203a58; }
.bucket-extract-json { color: #60b860; background: #0d2010; border-color: #1a3a1a; }
.bucket-verify      { color: #e07070; background: #2a1010; border-color: #4a2020; }
.bucket-general     { color: #5a9fd4; background: #0d1e30; border-color: #1a3a58; }
.bucket-unknown     { color: #888888; background: #1a1a1a; border-color: #333333; }

/* "+" button to reveal all toggles */
.bucket-add-btn {
  font-size: 0.72rem;
  width: 16px; height: 16px;
  display: flex; align-items: center; justify-content: center;
  padding: 0;
  background: none;
  border: 1px solid #333;
  border-radius: 3px;
  color: #555;
  cursor: pointer;
  line-height: 1;
}
.bucket-add-btn:hover { color: #999; border-color: #555; }
.bucket-add-btn.open { color: #7ec8e3; border-color: #2a5070; background: #1e3d52; }

/* All-buckets picker (shown when expanded) */
.bucket-all { display: flex; flex-wrap: wrap; gap: 0.25rem; padding-top: 0.15rem; }
.bucket-toggle {
  display: flex; align-items: center; gap: 0.25rem;
  font-size: 0.65rem; font-family: monospace;
  padding: 1px 6px;
  border-radius: 3px;
  border: 1px solid #2a2a2a;
  background: #141414;
  color: #555;
  cursor: pointer;
  user-select: none;
}
.bucket-toggle input { display: none; }
.bucket-toggle.active { filter: none; }
/* Active toggles reuse the same bucket-* color classes above */

.btn-reset { font-size: 0.65rem; color: #666; background: none; border: none; cursor: pointer; text-decoration: underline; align-self: flex-start; padding: 0; }
.btn-reset:hover { color: #aaa; }
</style>
