<template>
  <Teleport to="body">
    <div v-if="open" class="fpm-backdrop" @click.self="emit('close')">
      <div class="fpm-dialog" role="dialog" aria-modal="true" aria-label="Full prompt">
        <div class="fpm-header">
          <span class="fpm-title">Full prompt{{ stepLabel ? ` — ${stepLabel}` : '' }}</span>
          <button class="fpm-close" type="button" title="Close" @click="emit('close')">×</button>
        </div>
        <div v-if="hasUnresolved" class="fpm-banner">
          Some values not yet available — run the pipeline first
        </div>
        <XmlPreview class="fpm-xml" :value="xmlText" />
        <div class="fpm-footer">
          <button class="fpm-copy-btn" type="button" @click="handleCopy">{{ copyLabel }}</button>
          <button class="fpm-close-btn" type="button" @click="emit('close')">Close</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import {ref} from 'vue';
import XmlPreview from '../shared/XmlPreview.vue';

const props = defineProps<{
  open: boolean;
  xmlText: string;
  hasUnresolved?: boolean;
  stepLabel?: string;
}>();

const emit = defineEmits<{close: []}>();

const copyLabel = ref('Copy');

async function handleCopy() {
  await navigator.clipboard.writeText(props.xmlText);
  copyLabel.value = 'Copied!';
  setTimeout(() => {
    copyLabel.value = 'Copy';
  }, 2000);
}
</script>

<style scoped>
.fpm-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9000;
}

.fpm-dialog {
  background: #141414;
  border: 1px solid #2a2a2a;
  border-radius: 6px;
  width: min(780px, 92vw);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.fpm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.6rem 0.8rem;
  border-bottom: 1px solid #222;
  flex-shrink: 0;
}

.fpm-title {
  font-size: 0.78rem;
  color: #aaa;
  font-weight: 500;
}

.fpm-close {
  background: none;
  border: none;
  color: #666;
  font-size: 1.1rem;
  cursor: pointer;
  line-height: 1;
  padding: 0 2px;
}
.fpm-close:hover { color: #e07070; }

.fpm-banner {
  font-size: 0.72rem;
  color: #c8a060;
  background: #1a1500;
  border-bottom: 1px solid #332800;
  padding: 0.35rem 0.8rem;
  flex-shrink: 0;
}

.fpm-xml {
  flex: 1;
  overflow-y: auto;
  margin: 0;
  padding: 0.75rem 0.9rem;
  font-size: 0.72rem;
  font-family: monospace;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
}

.fpm-footer {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
  padding: 0.5rem 0.8rem;
  border-top: 1px solid #222;
  flex-shrink: 0;
}

.fpm-copy-btn,
.fpm-close-btn {
  font-size: 0.72rem;
  padding: 4px 12px;
  border-radius: 3px;
  cursor: pointer;
}

.fpm-copy-btn {
  background: #1a2a1a;
  border: 1px solid #2a4a2a;
  color: #6db86d;
}
.fpm-copy-btn:hover { background: #1e381e; }

.fpm-close-btn {
  background: #1a1a1a;
  border: 1px solid #333;
  color: #888;
}
.fpm-close-btn:hover { background: #222; color: #aaa; }
</style>
