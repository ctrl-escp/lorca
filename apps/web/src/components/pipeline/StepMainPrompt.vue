<template>
  <div v-if="field" class="step-main-prompt">
    <FieldLabel :label="field.label" :required="!!field.required" :title="field.title" />
    <textarea
      v-model="localValue"
      :rows="field.rows"
      :placeholder="field.placeholder"
      :title="field.title"
      @blur="commit"
    />
  </div>
  <div v-else-if="hint" class="step-main-prompt step-main-prompt-hint">
    <p>{{ hint }}</p>
  </div>
</template>

<script setup lang="ts">
import {ref, computed, watch} from 'vue';
import type {PipelineNode} from '@lorca/core';
import FieldLabel from '../common/FieldLabel.vue';

const props = defineProps<{
  node: PipelineNode | null;
  userPrompt: string;
  /** Label when editing the pipeline/capsule input prompt (default: Target prompt). */
  inputPromptLabel?: string;
}>();

const emit = defineEmits<{
  'update:userPrompt': [value: string];
  'update:node': [patch: Record<string, unknown>];
}>();

const localValue = ref('');

type PromptField = {
  label: string;
  required?: boolean;
  title: string;
  placeholder?: string;
  rows: number;
  kind: 'user-prompt' | 'node';
  readNode: (node: PipelineNode) => string;
  nodePatch: (value: string) => Record<string, unknown>;
};

const FIELDS: Partial<Record<PipelineNode['type'], PromptField>> = {
  input: {
    label: 'Target prompt',
    required: true,
    title: 'Your main input text — wrapped and passed through the pipeline on Execute',
    placeholder: 'Enter your target prompt…',
    rows: 5,
    kind: 'user-prompt',
    readNode: () => '',
    nodePatch: () => ({}),
  },
  'manual-text': {
    label: 'Text',
    required: true,
    title: 'Static text written to this step\'s output artifact',
    placeholder: 'Enter text for this step…',
    rows: 6,
    kind: 'node',
    readNode: (n) => (n.type === 'manual-text' ? n.text : ''),
    nodePatch: (v) => ({text: v}),
  },
  'prompt-wrapper': {
    label: 'Instruction text',
    title: 'System-style instructions placed inside the wrapper tag',
    placeholder: 'Enter instructions…',
    rows: 6,
    kind: 'node',
    readNode: (n) => (n.type === 'prompt-wrapper' ? n.config.instructionText : ''),
    nodePatch: (v) => ({config: {instructionText: v}}),
  },
  template: {
    label: 'Template',
    required: true,
    title: 'Text template with {{artifact.key}} and {{param.name}} placeholders',
    placeholder: 'Enter template…',
    rows: 8,
    kind: 'node',
    readNode: (n) => (n.type === 'template' ? n.template : ''),
    nodePatch: (v) => ({template: v}),
  },
  'model-call': {
    label: 'System prompt',
    title: 'Separate system instruction (chat mode or Ollama generate system field)',
    placeholder: 'Optional system prompt…',
    rows: 4,
    kind: 'node',
    readNode: (n) => (n.type === 'model-call' ? (n.config.systemPrompt ?? '') : ''),
    nodePatch: () => ({}),
  },
};

const HINTS: Partial<Record<PipelineNode['type'], string>> = {
  'json-extract': 'This step parses JSON from a prior artifact. Set the input reference in the Inspector.',
  'capsule-instance': 'Capsule steps run a locked sub-pipeline. Configure bindings in the Inspector.',
};

const activeNode = computed(() => props.node ?? null);

const field = computed(() => {
  const node = activeNode.value;
  const base = !node ? FIELDS.input : FIELDS[node.type];
  if (!base || base.kind !== 'user-prompt') return base ?? null;
  return {
    ...base,
    label: props.inputPromptLabel ?? base.label,
  };
});

const hint = computed(() => {
  const node = activeNode.value;
  if (!node) return null;
  return HINTS[node.type] ?? null;
});

function syncLocalFromSource() {
  const f = field.value;
  const node = activeNode.value;
  if (!f) {
    localValue.value = '';
    return;
  }
  if (f.kind === 'user-prompt') {
    localValue.value = props.userPrompt;
  } else if (node) {
    localValue.value = f.readNode(node);
  } else {
    localValue.value = '';
  }
}

watch([() => props.node, () => props.userPrompt, field], syncLocalFromSource, {immediate: true});

function commit() {
  const f = field.value;
  if (!f) return;
  if (f.kind === 'user-prompt') {
    if (localValue.value !== props.userPrompt) {
      emit('update:userPrompt', localValue.value);
    }
    return;
  }
  const node = activeNode.value;
  if (!node) return;
  const current = f.readNode(node);
  if (localValue.value === current) return;

  if (node.type === 'model-call') {
    const config = {...node.config};
    const trimmed = localValue.value.trim();
    if (trimmed) config.systemPrompt = trimmed;
    else delete config.systemPrompt;
    emit('update:node', {config});
    return;
  }

  emit('update:node', f.nodePatch(localValue.value));
}
</script>

<style scoped>
.step-main-prompt {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid #1e1e1e;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.step-main-prompt textarea {
  background: #111;
  border: 1px solid #2a2a2a;
  color: #e8e8e8;
  border-radius: 4px;
  padding: 8px 10px;
  font-size: 0.85rem;
  resize: vertical;
  font-family: inherit;
  min-height: 4.5rem;
}
.step-main-prompt textarea:focus {
  outline: none;
  border-color: #3a6080;
}
.step-main-prompt-hint p {
  margin: 0;
  font-size: 0.78rem;
  color: #555;
  line-height: 1.4;
}
</style>
