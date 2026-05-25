<template>
  <div v-if="description || expanded" class="step-comment-wrap">
    <button
      type="button"
      class="step-comment-header"
      :aria-expanded="expanded"
      @click.stop="emit('toggle')"
    >
      <span class="step-comment-toggle">{{ expanded ? '−' : '+' }}</span>
      <span v-if="!expanded && description" class="step-comment-preview">{{ description }}</span>
      <span v-else class="step-comment-label">Comment</span>
    </button>
    <TextEditor
      v-if="expanded"
      class="step-comment-textarea"
      :model-value="draft"
      placeholder="Add a comment…"
      :rows="3"
      @update:model-value="emit('update:draft', $event)"
      @click.stop
      @keydown.stop
    />
    <div v-if="expanded" class="step-comment-actions">
      <button class="btn btn-sm btn-primary" type="button" @click.stop="emit('save')">Save</button>
      <button class="btn btn-sm btn-ghost" type="button" @click.stop="emit('cancel')">Cancel</button>
    </div>
  </div>
</template>
<script setup lang="ts">
import TextEditor from '../shared/TextEditor.vue';

defineProps<{
  description?: string | undefined;
  expanded: boolean;
  draft: string;
}>();

const emit = defineEmits<{
  toggle: [];
  'update:draft': [value: string];
  save: [];
  cancel: [];
}>();
</script>
<style scoped>
.step-comment-wrap {
  background: #0e0d08;
  border: 1px solid #2a2510;
  border-radius: 5px;
  overflow: hidden;
}
.step-comment-header {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.3rem 0.55rem;
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
}
.step-comment-header:hover { background: #141208; }
.step-comment-toggle {
  width: 1ch;
  color: #6a5f20;
  font-family: monospace;
  font-size: clamp(0.86rem, 1.7cqh, 1.1rem);
  font-weight: 700;
  flex-shrink: 0;
}
.step-comment-label {
  color: #6a5f20;
  font-size: clamp(0.68rem, 1.35cqh, 0.9rem);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.step-comment-preview {
  flex: 1;
  color: #a89040;
  font-size: clamp(0.82rem, 1.65cqh, 1.05rem);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.step-comment-header:hover .step-comment-label,
.step-comment-header:hover .step-comment-toggle,
.step-comment-header:hover .step-comment-preview { color: #d4b050; }
.step-comment-textarea {
  display: block;
  width: 100%;
  box-sizing: border-box;
  cursor: text;
}
.step-comment-textarea :deep(.cm-editor) {
  background: #0a0900;
  border: none;
  border-top: 1px solid #2a2510;
  color: #c8a840;
  font-size: clamp(0.9rem, 1.8cqh, 1.15rem);
  font-family: inherit;
  line-height: 1.5;
}
.step-comment-textarea :deep(.cm-content) { padding: 0.55rem 0.65rem; font-family: inherit; }
.step-comment-textarea :deep(.cm-focused) { background: #0c0a00; border-top-color: #4a3d18; }
.step-comment-textarea :deep(.cm-placeholder) { color: #4a4010; }
.step-comment-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.45rem;
  padding: 0.45rem 0.55rem 0.5rem;
  border-top: 1px solid #2a2510;
  background: #0b0a03;
}
.btn { background: #1a1a1a; border: 1px solid #2a2a2a; color: var(--text-label); border-radius: 4px; cursor: pointer; }
.btn-sm { padding: 3px 9px; font-size: 0.72rem; }
.btn:hover:not(:disabled) { background: #222; color: #ccc; border-color: #3a3a3a; }
.btn-primary { background: var(--accent-bg); border-color: var(--accent-border); color: var(--accent); }
.btn-primary:hover:not(:disabled) { background: var(--accent-bg-hover); color: #a8dff5; }
.btn-ghost { background: none; border-color: transparent; color: var(--text-secondary); }
.btn-ghost:hover:not(:disabled) { background: #1a1a1a; color: var(--text-label); border-color: #333; }
</style>
