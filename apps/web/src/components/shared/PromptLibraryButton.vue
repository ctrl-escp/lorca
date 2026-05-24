<template>
  <div class="prompt-library-trigger">
    <button
      type="button"
      class="pl-trigger-btn"
      :title="title"
      :disabled="disabled"
      @click="open = true"
    >{{ label }}</button>
    <PromptLibraryModal
      :open="open"
      :entries="entries"
      @close="open = false"
      @select="onSelect"
    />
  </div>
</template>

<script setup lang="ts">
import {ref} from 'vue';
import PromptLibraryModal from './PromptLibraryModal.vue';
import {useStepRolePromptCatalog} from '../../composables/useStepRolePromptCatalog.js';

const props = withDefaults(defineProps<{
  currentText?: string;
  label?: string;
  title?: string;
  disabled?: boolean;
}>(), {
  currentText: '',
  label: 'Role template…',
  title: 'Choose a built-in role prompt as a starting point for this step',
  disabled: false,
});

const emit = defineEmits<{
  select: [text: string];
}>();

const open = ref(false);
const entries = useStepRolePromptCatalog(() => props.currentText);

function onSelect(text: string) {
  emit('select', text);
}
</script>

<style scoped>
.prompt-library-trigger {
  flex-shrink: 0;
}

.pl-trigger-btn {
  background: #1a1a1a;
  border: 1px solid #333;
  color: var(--text-label);
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 0.72rem;
  cursor: pointer;
  white-space: nowrap;
}
.pl-trigger-btn:hover:not(:disabled) {
  background: #222;
  color: #ccc;
  border-color: var(--accent-border);
}
.pl-trigger-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
