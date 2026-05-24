<template>
  <Teleport to="body">
    <div v-if="open" class="dialog-backdrop" @click.self="$emit('cancel')">
      <div class="dialog-box" role="dialog" :aria-labelledby="titleId" aria-modal="true">
        <div class="dialog-title" :id="titleId">{{ title }}</div>
        <div class="dialog-message">{{ message }}</div>
        <div class="dialog-actions">
          <button type="button" class="btn-dialog btn-dialog-cancel" @click="$emit('cancel')">Cancel</button>
          <button
            type="button"
            class="btn-dialog"
            :class="destructive ? 'btn-dialog-destructive' : 'btn-dialog-confirm'"
            @click="$emit('confirm')"
          >{{ confirmLabel ?? 'OK' }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import {computed} from 'vue';

defineProps<{
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
}>();

defineEmits<{confirm: []; cancel: []}>();

const titleId = computed(() => `confirm-dialog-title-${Math.random().toString(36).slice(2)}`);
</script>

<style scoped>
.dialog-backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,0.6);
  display: flex; align-items: center; justify-content: center; z-index: 9999;
}
.dialog-box {
  background: #141414; border: 1px solid #2a2a2a; border-radius: 6px;
  padding: 1.25rem 1.5rem; min-width: 280px; max-width: 420px;
  display: flex; flex-direction: column; gap: 0.75rem;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
}
.dialog-title { font-size: 0.9rem; font-weight: 600; color: #e8e8e8; }
.dialog-message { font-size: 0.82rem; color: #aaa; line-height: 1.5; white-space: pre-wrap; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.25rem; }
.btn-dialog {
  border-radius: 4px; padding: 5px 14px; font-size: 0.82rem; cursor: pointer;
  border: 1px solid #333;
}
.btn-dialog-cancel { background: #1a1a1a; color: #aaa; }
.btn-dialog-cancel:hover { background: #222; color: #ccc; }
.btn-dialog-confirm { background: var(--accent-bg); border-color: var(--accent-border); color: var(--accent); }
.btn-dialog-confirm:hover { background: var(--accent-bg-hover); }
.btn-dialog-destructive { background: #2d1a1a; border-color: #4d2222; color: #e07070; }
.btn-dialog-destructive:hover { background: #3d2222; }
</style>
