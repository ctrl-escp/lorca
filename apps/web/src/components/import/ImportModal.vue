<template>
  <Teleport to="body">
    <div v-if="open" class="dialog-backdrop" @click.self="$emit('close')">
      <div class="dialog" role="dialog" aria-modal="true">
        <header class="dialog-header">
          <span class="dialog-title">Import {{ kindLabel }}</span>
          <button class="btn-close" type="button" @click="$emit('close')">×</button>
        </header>

        <div class="dialog-body">
          <textarea
            class="json-input"
            v-model="jsonText"
            placeholder="Paste JSON here…"
            spellcheck="false"
          />
          <label class="option-row">
            <input type="checkbox" v-model="includeStepOutputs" />
            <span>Import included step outputs</span>
          </label>
          <div v-if="parseError" class="parse-error">{{ parseError }}</div>
        </div>

        <footer class="dialog-footer">
          <button type="button" class="btn btn-secondary" @click="$emit('close')">Cancel</button>
          <label class="btn btn-file">
            Load from file
            <input type="file" accept=".json,application/json" @change="handleFile" />
          </label>
          <button type="button" class="btn btn-primary" :disabled="!jsonText.trim()" @click="handleImport">Import</button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import {ref, watch, computed} from 'vue';

const props = defineProps<{
  open: boolean;
  kind: 'pipeline' | 'capsule';
}>();

const emit = defineEmits<{
  close: [];
  submit: [json: string, includeStepOutputs: boolean];
}>();

const jsonText = ref('');
const parseError = ref('');
const includeStepOutputs = ref(false);

const kindLabel = computed(() => props.kind === 'pipeline' ? 'Pipeline' : 'Capsule');

watch(() => props.open, (open) => {
  if (open) { jsonText.value = ''; parseError.value = ''; includeStepOutputs.value = false; }
});

function handleFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    jsonText.value = reader.result as string;
    parseError.value = '';
  };
  reader.readAsText(file);
  (e.target as HTMLInputElement).value = '';
}

function handleImport() {
  parseError.value = '';
  try {
    JSON.parse(jsonText.value);
  } catch {
    parseError.value = 'Invalid JSON — please check the content and try again.';
    return;
  }
  emit('submit', jsonText.value, includeStepOutputs.value);
}
</script>

<style scoped>
.dialog-backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,0.65);
  display: flex; align-items: center; justify-content: center; z-index: 9999;
}
.dialog {
  width: min(580px, calc(100vw - 2rem)); max-height: calc(100vh - 4rem);
  background: #141414; border: 1px solid #333; border-radius: 8px;
  display: flex; flex-direction: column; overflow: hidden;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
}
.dialog-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.75rem 1rem; border-bottom: 1px solid #222;
}
.dialog-title { font-size: 0.9rem; font-weight: 600; color: #e8e8e8; }
.btn-close {
  background: none; border: none; color: var(--text-label); font-size: 1.2rem;
  cursor: pointer; padding: 0 2px; line-height: 1;
}
.btn-close:hover { color: #aaa; }
.dialog-body {
  padding: 1rem; display: flex; flex-direction: column; gap: 0.5rem; flex: 1; min-height: 0;
}
.json-input {
  flex: 1; min-height: 260px; background: #0d0d0d; border: 1px solid #2a2a2a;
  border-radius: 4px; color: #a8d8a8; font-family: 'Menlo', 'Monaco', 'Consolas', monospace;
  font-size: 0.75rem; padding: 0.6rem; resize: vertical; line-height: 1.5;
}
.json-input:focus { outline: none; border-color: #2a5070; }
.option-row {
  display: flex; align-items: center; gap: 0.45rem;
  font-size: 0.78rem; color: #bbb; user-select: none;
}
.option-row input { cursor: pointer; }
.parse-error { font-size: 0.78rem; color: #e07070; }
.dialog-footer {
  display: flex; align-items: center; gap: 0.5rem; justify-content: flex-end;
  padding: 0.75rem 1rem; border-top: 1px solid #222;
}
.btn {
  border-radius: 4px; padding: 5px 14px; font-size: 0.82rem;
  cursor: pointer; border: 1px solid #333;
}
.btn-secondary { background: #1a1a1a; color: #ccc; }
.btn-secondary:hover { background: #222; }
.btn-file {
  background: #1a1a1a; color: #ccc; border: 1px solid #333;
  border-radius: 4px; padding: 5px 14px; font-size: 0.82rem;
  cursor: pointer; display: inline-block;
}
.btn-file:hover { background: #222; color: #e8e8e8; }
.btn-file input { display: none; }
.btn-primary { background: #1e3d52; border-color: #2a5070; color: #7ec8e3; }
.btn-primary:hover:not(:disabled) { background: #254a62; }
.btn-primary:disabled { opacity: 0.4; cursor: default; }
</style>
