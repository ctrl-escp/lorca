<template>
  <Teleport to="body">
    <div v-if="open" class="dialog-backdrop" @click.self="$emit('cancel')">
      <div class="dialog-box" role="dialog" :aria-labelledby="titleId" aria-modal="true">
        <div class="dialog-title" :id="titleId">{{ title }}</div>
        <label class="dialog-label" :for="inputId">{{ label }}</label>
        <input
          :id="inputId"
          ref="inputRef"
          v-model="localValue"
          class="dialog-input"
          type="text"
          @keydown.enter="onConfirm"
          @keydown.esc="$emit('cancel')"
        />
        <div class="dialog-actions">
          <button type="button" class="btn-dialog btn-dialog-cancel" @click="$emit('cancel')">Cancel</button>
          <button type="button" class="btn-dialog btn-dialog-confirm" @click="onConfirm">{{ confirmLabel ?? 'OK' }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import {ref, watch, nextTick, computed} from 'vue';

const props = defineProps<{
  open: boolean;
  title: string;
  label: string;
  defaultValue?: string;
  confirmLabel?: string;
}>();

const emit = defineEmits<{confirm: [value: string]; cancel: []}>();

const inputRef = ref<HTMLInputElement | null>(null);
const localValue = ref(props.defaultValue ?? '');
const titleId = computed(() => `prompt-dialog-title-${Math.random().toString(36).slice(2)}`);
const inputId = computed(() => `prompt-dialog-input-${Math.random().toString(36).slice(2)}`);

watch(() => props.open, async (open) => {
  if (open) {
    localValue.value = props.defaultValue ?? '';
    await nextTick();
    inputRef.value?.focus();
    inputRef.value?.select();
  }
});

function onConfirm() {
  if (!localValue.value.trim()) return;
  emit('confirm', localValue.value.trim());
}
</script>

<style scoped>
.dialog-backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,0.6);
  display: flex; align-items: center; justify-content: center; z-index: 9999;
}
.dialog-box {
  background: #141414; border: 1px solid #2a2a2a; border-radius: 6px;
  padding: 1.25rem 1.5rem; min-width: 300px; max-width: 440px;
  display: flex; flex-direction: column; gap: 0.65rem;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
}
.dialog-title { font-size: 0.9rem; font-weight: 600; color: #e8e8e8; }
.dialog-label { font-size: 0.75rem; color: #888; }
.dialog-input {
  background: #111; border: 1px solid #2a2a2a; color: #e8e8e8;
  border-radius: 4px; padding: 6px 10px; font-size: 0.88rem; width: 100%;
}
.dialog-input:focus { outline: none; border-color: #3a6080; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.25rem; }
.btn-dialog {
  border-radius: 4px; padding: 5px 14px; font-size: 0.82rem; cursor: pointer;
  border: 1px solid #333;
}
.btn-dialog-cancel { background: #1a1a1a; color: #aaa; }
.btn-dialog-cancel:hover { background: #222; color: #ccc; }
.btn-dialog-confirm { background: #1e3d52; border-color: #2a5070; color: #7ec8e3; }
.btn-dialog-confirm:hover { background: #254a62; }
</style>
