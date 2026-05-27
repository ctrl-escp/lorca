<template>
  <div v-if="open" class="dialog-backdrop" @click.self="emit('close')">
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="generator-title">
      <header class="dialog-header">
        <h2 id="generator-title">Build from description</h2>
        <button class="dialog-close" type="button" title="Close" @click="emit('close')">×</button>
      </header>

      <div class="dialog-body">
        <label class="field">
          <span class="hdr-prompt">Description</span>
          <TextEditor
            :model-value="description"
            :rows="5"
            placeholder="Describe the pipeline you want…"
            :disabled="loading"
            @update:model-value="emit('update:description', $event)"
          />
        </label>

        <div class="options-row">
          <label class="option">
            <span>Apply mode</span>
            <select
              :value="applyMode"
              :disabled="loading"
              @change="emit('update:applyMode', ($event.target as HTMLSelectElement).value as 'replace' | 'append')"
            >
              <option value="replace">Replace pipeline</option>
              <option value="append">Append to current</option>
            </select>
          </label>
          <label class="option checkbox">
            <input
              type="checkbox"
              :checked="allowCapsules"
              :disabled="loading"
              @change="emit('update:allowCapsules', ($event.target as HTMLInputElement).checked)"
            />
            <span>Allow capsule steps</span>
          </label>
          <label class="option checkbox">
            <input
              type="checkbox"
              :checked="refinePreviousPlan"
              :disabled="loading || !rawResponse"
              @change="emit('update:refinePreviousPlan', ($event.target as HTMLInputElement).checked)"
            />
            <span>Refine previous plan</span>
          </label>
        </div>

        <div v-if="errorMessage" class="error-box">
          <span>{{ errorMessage }}</span>
          <button v-if="rawResponse" type="button" class="link-btn" @click="showRaw = !showRaw">
            {{ showRaw ? 'Hide raw' : 'Show raw' }}
          </button>
        </div>

        <pre v-if="showRaw && rawResponse" class="raw-response">{{ rawResponse }}</pre>

        <div v-if="validationErrors.length > 0" class="error-box">
          <ul class="msg-list">
            <li v-for="(msg, i) in validationErrors" :key="`err-${i}`">{{ msg }}</li>
          </ul>
        </div>

        <div v-if="assumptions.length > 0" class="info-box">
          <span class="box-title">Assumptions</span>
          <ul class="msg-list">
            <li v-for="(item, i) in assumptions" :key="`asm-${i}`">{{ item }}</li>
          </ul>
        </div>

        <div v-if="warnings.length > 0" class="warning-box">
          <span class="box-title">Warnings</span>
          <ul class="msg-list">
            <li v-for="(item, i) in warnings" :key="`warn-${i}`">{{ item }}</li>
          </ul>
        </div>

        <div v-if="previewItems.length > 0" class="preview">
          <span class="preview-title hdr-preview">Preview</span>
          <ol>
            <li v-for="(item, index) in previewItems" :key="`${item.label}-${index}`">
              <span class="preview-label">{{ item.label }}</span>
              <span v-if="item.modelHint" class="preview-meta">{{ item.modelHint }}</span>
            </li>
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
        <button class="btn btn-secondary" type="button" :disabled="loading" @click="emit('clear-all')">
          Clear all
        </button>
        <button class="btn btn-secondary" type="button" :disabled="loading" @click="emit('close')">
          Cancel
        </button>
        <button
          class="btn btn-secondary"
          type="button"
          :disabled="loading || !canResolveModels"
          title="Map missing models before applying"
          @click="emit('resolve-models')"
        >
          Resolve models…
        </button>
        <button
          class="btn btn-secondary"
          type="button"
          :disabled="loading || !canGenerate"
          @click="emit('generate')"
        >
          {{ loading ? 'Building…' : 'Generate' }}
        </button>
        <button
          class="btn btn-primary"
          type="button"
          :disabled="loading || !canApply"
          title="Commit preview to the pipeline editor"
          @click="emit('apply')"
        >
          Apply
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import {ref} from 'vue';
import TextEditor from '../shared/TextEditor.vue';

import type {GeneratorPreviewItem} from '../../composables/usePipelineGeneratorFlow.js';

defineProps<{
  previewItems: GeneratorPreviewItem[];
  open: boolean;
  description: string;
  applyMode: 'replace' | 'append';
  allowCapsules: boolean;
  refinePreviousPlan: boolean;
  loading: boolean;
  errorMessage: string | null;
  rawResponse: string | null;
  assumptions: string[];
  warnings: string[];
  validationErrors: string[];
  manualImportAvailable: boolean;
  canGenerate: boolean;
  canApply: boolean;
  canResolveModels: boolean;
}>();

const emit = defineEmits<{
  close: [];
  generate: [];
  apply: [];
  'resolve-models': [];
  'manual-import': [];
  'clear-all': [];
  'update:description': [value: string];
  'update:applyMode': [value: 'replace' | 'append'];
  'update:allowCapsules': [value: boolean];
  'update:refinePreviousPlan': [value: boolean];
}>();

const showRaw = ref(false);
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
  width: min(680px, calc(100vw - 2rem));
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
.field span, .preview-title, .box-title {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 600;
}
.options-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1.25rem;
  align-items: flex-end;
}
.option {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.78rem;
  color: var(--text-label);
}
.option.checkbox {
  flex-direction: row;
  align-items: center;
  gap: 0.4rem;
}
select {
  background: #111;
  border: 1px solid #2a2a2a;
  color: #e8e8e8;
  border-radius: 4px;
  padding: 0.45rem 0.55rem;
  font: inherit;
  min-width: 10rem;
}
select:focus { outline: none; border-color: var(--accent-border); }
.error-box, .warning-box, .info-box {
  border-radius: 4px;
  padding: 0.5rem 0.6rem;
  font-size: 0.82rem;
}
.error-box {
  display: flex;
  align-items: flex-start;
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
.info-box {
  color: #9ab0c8;
  background: #0f141a;
  border: 1px solid #2a3544;
}
.msg-list {
  margin: 0.25rem 0 0;
  padding-left: 1.2rem;
}
.link-btn {
  background: none;
  border: none;
  color: var(--accent);
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
.preview ol {
  margin: 0;
  padding-left: 1.4rem;
  color: #ddd;
  font-size: 0.86rem;
}
.preview li + li { margin-top: 0.35rem; }
.preview-label { display: inline; }
.preview-meta {
  display: block;
  font-size: 0.75rem;
  color: #888;
  margin-top: 0.1rem;
}
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
.btn-primary { background: var(--accent-bg); border-color: var(--accent-border); color: var(--accent); }
</style>
