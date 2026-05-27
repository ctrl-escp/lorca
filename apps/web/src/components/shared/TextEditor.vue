<template>
  <div
    ref="hostRef"
    class="text-editor"
    :class="{disabled}"
    :style="editorStyle"
    :title="title"
  />
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref, shallowRef, watch} from 'vue';
import {minimalSetup} from 'codemirror';
import {EditorState, Compartment} from '@codemirror/state';
import {EditorView, placeholder as editorPlaceholder, keymap} from '@codemirror/view';
import {autocompletion} from '@codemirror/autocomplete';
import {indentWithTab} from '@codemirror/commands';
import {json} from '@codemirror/lang-json';
import {artifactCompletionSource} from '../../utils/textEditorCompletion.js';

const props = withDefaults(defineProps<{
  modelValue: string;
  rows?: number;
  placeholder?: string;
  title?: string;
  disabled?: boolean;
  artifactRefs?: string[];
  language?: 'plain' | 'json';
}>(), {
  rows: 4,
  placeholder: '',
  title: '',
  disabled: false,
  artifactRefs: () => [],
  language: 'plain',
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  focus: [event: FocusEvent];
  blur: [event: FocusEvent];
}>();

const hostRef = ref<HTMLDivElement | null>(null);
const viewRef = shallowRef<EditorView | null>(null);
const completionCompartment = new Compartment();
const editableCompartment = new Compartment();
const languageCompartment = new Compartment();
const placeholderCompartment = new Compartment();
let applyingExternalValue = false;

const editorStyle = computed(() => ({
  '--text-editor-min-height': `${Math.max(props.rows, 1) * 1.45 + 1.1}rem`,
}));

function completionExtension(refs: readonly string[]) {
  return autocompletion({
    override: refs.length > 0 ? [artifactCompletionSource(refs)] : [],
    activateOnTyping: refs.length > 0,
  });
}

function editableExtension(disabled: boolean) {
  return [
    EditorView.editable.of(!disabled),
    EditorState.readOnly.of(disabled),
  ];
}

function languageExtension(language: 'plain' | 'json') {
  return language === 'json' ? json() : [];
}

onMounted(() => {
  if (!hostRef.value) return;
  const state = EditorState.create({
    doc: props.modelValue,
    extensions: [
      minimalSetup,
      keymap.of([indentWithTab]),
      EditorView.lineWrapping,
      placeholderCompartment.of(editorPlaceholder(props.placeholder)),
      completionCompartment.of(completionExtension(props.artifactRefs)),
      editableCompartment.of(editableExtension(props.disabled)),
      languageCompartment.of(languageExtension(props.language)),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged || applyingExternalValue) return;
        emit('update:modelValue', update.state.doc.toString());
      }),
      EditorView.domEventHandlers({
        focus: (event) => { emit('focus', event); },
        blur: (event) => { emit('blur', event); },
      }),
      EditorView.theme({
        '&': {
          minHeight: 'var(--text-editor-min-height)',
          backgroundColor: '#0d0d0d',
          border: '1px solid #2a2a2a',
          borderRadius: '4px',
          color: '#e8e8e8',
          fontSize: '0.8rem',
          lineHeight: '1.45',
        },
        '&.cm-focused': {
          outline: 'none',
          borderColor: 'var(--accent-border)',
        },
        '.cm-content': {
          minHeight: 'var(--text-editor-min-height)',
          padding: '7px 9px',
          fontFamily: 'Menlo, Monaco, Consolas, monospace',
        },
        '.cm-scroller': {
          fontFamily: 'inherit',
        },
        '.cm-placeholder': {
          color: '#666',
        },
        '.cm-gutters': {
          backgroundColor: '#101010',
          color: '#555',
          borderRight: '1px solid #242424',
        },
        '.cm-cursor, .cm-dropCursor': {
          borderLeftColor: '#e8e8e8',
        },
      }, {dark: true}),
    ],
  });
  viewRef.value = new EditorView({state, parent: hostRef.value});
});

watch(() => props.modelValue, (value) => {
  const view = viewRef.value;
  if (!view || value === view.state.doc.toString()) return;
  applyingExternalValue = true;
  view.dispatch({
    changes: {from: 0, to: view.state.doc.length, insert: value},
  });
  applyingExternalValue = false;
});

watch(() => props.artifactRefs, (refs) => {
  viewRef.value?.dispatch({
    effects: completionCompartment.reconfigure(completionExtension(refs)),
  });
}, {deep: true});

watch(() => props.disabled, (disabled) => {
  viewRef.value?.dispatch({
    effects: editableCompartment.reconfigure(editableExtension(disabled)),
  });
});

watch(() => props.placeholder, (placeholder) => {
  viewRef.value?.dispatch({
    effects: placeholderCompartment.reconfigure(editorPlaceholder(placeholder)),
  });
});

watch(() => props.language, (language) => {
  viewRef.value?.dispatch({
    effects: languageCompartment.reconfigure(languageExtension(language)),
  });
});

onBeforeUnmount(() => {
  viewRef.value?.destroy();
  viewRef.value = null;
});
</script>

<style scoped>
.text-editor {
  width: 100%;
  box-sizing: border-box;
}

.text-editor.disabled {
  opacity: 0.65;
}
</style>
