<template>
  <div v-if="open" class="dialog-backdrop" @click.self="emit('close')">
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="generator-title">
      <header class="dialog-header">
        <h2 id="generator-title">Build from description</h2>
        <button class="dialog-close" type="button" title="Close" @click="emit('close')">×</button>
      </header>

      <div class="dialog-body">
        <label class="field">
          <span>Description</span>
          <textarea
            v-model="description"
            rows="5"
            placeholder="Describe the pipeline you want…"
            :disabled="loading"
          />
        </label>

        <label class="field">
          <span>Generator</span>
          <select v-model="selectedCapsuleId" :disabled="loading || generatorCapsules.length === 0">
            <option
              v-for="capsule in generatorCapsules"
              :key="capsule.id"
              :value="capsule.id"
            >
              {{ capsule.name }} ({{ capsule.status }})
            </option>
          </select>
        </label>

        <div v-if="errorMessage" class="error-box">
          <span>{{ errorMessage }}</span>
          <button v-if="rawResponse" type="button" class="link-btn" @click="showRaw = !showRaw">
            {{ showRaw ? 'Hide raw' : 'Show raw' }}
          </button>
        </div>

        <pre v-if="showRaw && rawResponse" class="raw-response">{{ rawResponse }}</pre>

        <div v-if="warnings.length > 0" class="warning-box">
          Unknown suggestion IDs were skipped: {{ warnings.join(', ') }}
        </div>

        <div v-if="previewLabels.length > 0" class="preview">
          <span class="preview-title">Preview</span>
          <ol>
            <li v-for="(label, index) in previewLabels" :key="`${label}-${index}`">{{ label }}</li>
          </ol>
        </div>
      </div>

      <footer class="dialog-footer">
        <button
          v-if="manualImportAvailable"
          class="btn btn-secondary"
          type="button"
          title="Open the standard pipeline import dialog"
          @click="emit('manual-import')"
        >
          Manual import
        </button>
        <button class="btn btn-secondary" type="button" :disabled="loading" @click="emit('close')">Cancel</button>
        <button class="btn btn-secondary" type="button" :disabled="loading || !canGenerate" @click="submit">
          {{ loading ? 'Building…' : 'Generate' }}
        </button>
        <button class="btn btn-primary" type="button" :disabled="loading || previewLabels.length === 0" @click="emit('apply')">
          Apply
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed, ref, watch} from 'vue';
import type {CapsuleDefinition} from '@lorca/core';

const props = defineProps<{
  open: boolean;
  generatorCapsules: CapsuleDefinition[];
  defaultCapsuleId: string;
  loading: boolean;
  errorMessage: string | null;
  rawResponse: string | null;
  previewLabels: string[];
  warnings: string[];
  manualImportAvailable: boolean;
}>();

const emit = defineEmits<{
  close: [];
  generate: [payload: {description: string; capsuleId: string}];
  apply: [];
  'manual-import': [];
}>();

const description = ref('');
const selectedCapsuleId = ref(props.defaultCapsuleId);
const showRaw = ref(false);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    description.value = '';
    selectedCapsuleId.value = props.defaultCapsuleId;
    showRaw.value = false;
  },
);

watch(
  () => props.rawResponse,
  () => { showRaw.value = false; },
);

const canGenerate = computed(() =>
  description.value.trim().length > 0 && selectedCapsuleId.value.length > 0,
);

function submit() {
  if (!canGenerate.value) return;
  emit('generate', {
    description: description.value.trim(),
    capsuleId: selectedCapsuleId.value,
  });
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
  width: min(620px, calc(100vw - 2rem));
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
  gap: 0.85rem;
}
.field { display: flex; flex-direction: column; gap: 0.35rem; }
.field span, .preview-title {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-section);
}
textarea, select {
  background: #111;
  border: 1px solid #2a2a2a;
  color: #e8e8e8;
  border-radius: 4px;
  padding: 0.5rem 0.6rem;
  font: inherit;
}
textarea { resize: vertical; line-height: 1.4; }
textarea:focus, select:focus { outline: none; border-color: #2a5070; }
.error-box, .warning-box {
  border-radius: 4px;
  padding: 0.5rem 0.6rem;
  font-size: 0.82rem;
}
.error-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  color: #e07070;
  background: #1a0f0f;
  border: 1px solid #4d2222;
}
.warning-box {
  color: #c8a050;
  background: #1a180f;
  border: 1px solid #4a4020;
}
.link-btn {
  background: none;
  border: none;
  color: #7ec8e3;
  cursor: pointer;
  padding: 0;
  white-space: nowrap;
}
.raw-response {
  max-height: 220px;
  overflow: auto;
  margin: 0;
  background: #0f0f0f;
  border: 1px solid #2a2a2a;
  border-radius: 4px;
  color: #aaa;
  padding: 0.65rem;
  font-size: 0.78rem;
  white-space: pre-wrap;
}
.preview {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.preview ol {
  margin: 0;
  padding-left: 1.4rem;
  color: #ddd;
  font-size: 0.86rem;
}
.preview li + li { margin-top: 0.25rem; }
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-top: 1px solid #222;
  flex-wrap: wrap;
}
.btn {
  border-radius: 4px;
  padding: 4px 14px;
  font-size: 0.82rem;
  cursor: pointer;
  border: 1px solid #333;
}
.btn-secondary { background: #1a1a1a; color: #ccc; }
.btn-secondary:disabled, .btn-primary:disabled { opacity: 0.4; cursor: default; }
.btn-primary { background: #1e3d52; border-color: #2a5070; color: #7ec8e3; }
</style>
