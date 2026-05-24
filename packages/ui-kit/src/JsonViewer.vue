<template>
  <div class="json-viewer">
    <div v-if="showHeader" class="jv-header">
      <div class="jv-mode-toggle" role="group" aria-label="JSON display mode">
        <button
          v-if="payload.isJson"
          type="button"
          class="jv-tool"
          :class="{active: effectiveMode === 'pretty'}"
          title="Show formatted JSON"
          @click="mode = 'pretty'"
        >Pretty</button>
        <button
          type="button"
          class="jv-tool"
          :class="{active: effectiveMode === 'raw'}"
          title="Show raw JSON text"
          @click="mode = 'raw'"
        >Raw</button>
      </div>
      <button
        type="button"
        class="jv-tool jv-copy"
        :title="copied ? 'Copied!' : 'Copy raw JSON'"
        @click="copyRaw"
      >{{ copied ? 'Copied' : 'Copy' }}</button>
    </div>

    <pre v-if="effectiveMode === 'raw'" class="jv-raw">{{ payload.rawText }}</pre>
    <div v-else class="jv-pretty" role="tree">
      <JsonNode :value="payload.parsed" :level="0" :is-last="true" />
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed, defineComponent, h, ref, watch} from 'vue';
import type {Component, PropType, VNodeChild} from 'vue';

type JsonViewerMode = 'pretty' | 'raw';
const JSON_FENCE_RE = /^```[ \t]*json[^\n\r]*\r?\n([\s\S]*?)\r?\n?```[ \t]*$/i;

const props = withDefaults(defineProps<{
  value: unknown;
  initialMode?: JsonViewerMode;
  showHeader?: boolean;
}>(), {
  initialMode: 'pretty',
  showHeader: true,
});

const mode = ref<JsonViewerMode>(props.initialMode);
const copied = ref(false);
let copyTimer: ReturnType<typeof setTimeout> | null = null;

const payload = computed(() => normalizeJsonValue(props.value));
const effectiveMode = computed<JsonViewerMode>(() => payload.value.isJson ? mode.value : 'raw');

watch(() => props.initialMode, (next) => {
  mode.value = next;
});

async function copyRaw() {
  try {
    await navigator.clipboard.writeText(payload.value.rawText);
    copied.value = true;
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => { copied.value = false; }, 1600);
  } catch {
    copied.value = false;
  }
}

function normalizeJsonValue(value: unknown): {parsed: unknown; rawText: string; isJson: boolean} {
  if (typeof value === 'string') {
    const jsonText = jsonTextFromString(value);
    if (jsonText !== null) {
      try {
        return {parsed: JSON.parse(jsonText), rawText: jsonText, isJson: true};
      } catch {
        return {parsed: value, rawText: value, isJson: false};
      }
    }
    return {parsed: value, rawText: value, isJson: false};
  }

  const rawText = stringifyJson(value, 0);
  return {parsed: value, rawText, isJson: true};
}

function jsonTextFromString(value: string): string | null {
  const trimmed = value.trim();
  const fenced = JSON_FENCE_RE.exec(trimmed);
  if (fenced?.[1] !== undefined) return fenced[1].trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return value;
  return null;
}

function stringifyJson(value: unknown, space?: number): string {
  const text = JSON.stringify(value, null, space);
  return text === undefined ? String(value) : text;
}

function isPlainJsonContainer(value: unknown): value is Record<string, unknown> | unknown[] {
  return value !== null && typeof value === 'object';
}

function isArray(value: Record<string, unknown> | unknown[]): value is unknown[] {
  return Array.isArray(value);
}

function entriesFor(value: Record<string, unknown> | unknown[]): Array<[string, unknown]> {
  if (isArray(value)) return value.map((item, index) => [String(index), item]);
  return Object.entries(value);
}

function summaryFor(value: Record<string, unknown> | unknown[]): string {
  const count = entriesFor(value).length;
  if (isArray(value)) return count === 1 ? '1 item' : `${count} items`;
  return count === 1 ? '1 key' : `${count} keys`;
}

function primitiveClass(value: unknown): string {
  if (value === null) return 'jv-null';
  switch (typeof value) {
    case 'string': return 'jv-string';
    case 'number': return 'jv-number';
    case 'boolean': return 'jv-bool';
    default: return 'jv-null';
  }
}

function primitiveText(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return stringifyJson(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return stringifyJson(value);
}

function keyPrefix(key: string | undefined): VNodeChild[] {
  if (key === undefined) return [];
  return [
    h('span', {class: 'jv-key'}, stringifyJson(key)),
    h('span', {class: 'jv-punctuation'}, ': '),
  ];
}

const JsonNode: Component = defineComponent({
  name: 'JsonNode',
  props: {
    value: {type: null as unknown as PropType<unknown>, required: true},
    itemKey: {type: String, required: false},
    level: {type: Number, required: true},
    isLast: {type: Boolean, required: true},
  },
  setup(nodeProps): () => VNodeChild {
    const collapsed = ref(false);

    return (): VNodeChild => {
      const comma = nodeProps.isLast ? '' : ',';
      const style = {paddingLeft: `${nodeProps.level}rem`};

      if (!isPlainJsonContainer(nodeProps.value)) {
        return h('div', {class: 'jv-line', style, role: 'treeitem'}, [
          ...keyPrefix(nodeProps.itemKey),
          h('span', {class: primitiveClass(nodeProps.value)}, primitiveText(nodeProps.value)),
          h('span', {class: 'jv-punctuation'}, comma),
        ]);
      }

      const value = nodeProps.value;
      const entries = entriesFor(value);
      const open = isArray(value) ? '[' : '{';
      const close = isArray(value) ? ']' : '}';
      const canCollapse = entries.length > 0;

      if (collapsed.value) {
        return h('div', {class: 'jv-line', style, role: 'treeitem', 'aria-expanded': 'false'}, [
          canCollapse
            ? h('button', {
              class: 'jv-collapse',
              type: 'button',
              title: 'Expand',
              onClick: () => { collapsed.value = false; },
            }, '▸')
            : h('span', {class: 'jv-spacer'}, ''),
          ...keyPrefix(nodeProps.itemKey),
          h('span', {class: 'jv-punctuation'}, open),
          h('span', {class: 'jv-badge'}, summaryFor(value)),
          h('span', {class: 'jv-punctuation'}, `${close}${comma}`),
        ]);
      }

      return h('div', {class: 'jv-node', role: 'treeitem', 'aria-expanded': canCollapse ? 'true' : undefined}, [
        h('div', {class: 'jv-line', style}, [
          canCollapse
            ? h('button', {
              class: 'jv-collapse',
              type: 'button',
              title: 'Collapse',
              onClick: () => { collapsed.value = true; },
            }, '▾')
            : h('span', {class: 'jv-spacer'}, ''),
          ...keyPrefix(nodeProps.itemKey),
          h('span', {class: 'jv-punctuation'}, open),
        ]),
        ...entries.map(([key, child], index) => h(JsonNode, {
          value: child,
          itemKey: isArray(value) ? undefined : key,
          level: nodeProps.level + 1,
          isLast: index === entries.length - 1,
        })),
        h('div', {class: 'jv-line', style}, [
          h('span', {class: 'jv-spacer'}, ''),
          h('span', {class: 'jv-punctuation'}, `${close}${comma}`),
        ]),
      ]);
    };
  },
});
</script>

<style>
.json-viewer {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 0;
}

.jv-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.45rem;
}

.jv-mode-toggle {
  display: flex;
  gap: 0.2rem;
}

.jv-tool {
  border: 1px solid #2a2a2a;
  background: #141414;
  color: var(--text-label);
  border-radius: 3px;
  cursor: pointer;
  font-size: 0.65rem;
  line-height: 1.2;
  padding: 2px 7px;
}

.jv-tool:hover {
  border-color: var(--accent-border);
  color: #c8d8e0;
}

.jv-tool.active {
  background: var(--accent-bg-muted);
  border-color: var(--accent-border-muted);
  color: var(--accent);
}

.jv-copy {
  margin-left: auto;
}

.jv-raw,
.jv-pretty {
  margin: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.78rem;
  line-height: 1.45;
  color: #ddd;
  background: #0a0a0a;
  border: 1px solid #222;
  border-radius: 4px;
  padding: 0.5rem 0.6rem;
  overflow: auto;
}

.jv-raw {
  white-space: pre-wrap;
  word-break: break-word;
}

.jv-pretty {
  white-space: pre;
}

.jv-line {
  min-height: 1.15rem;
}

.jv-collapse {
  appearance: none;
  width: 1rem;
  height: 1rem;
  margin: 0 0.1rem 0 0;
  padding: 0;
  color: var(--text-label);
  background: transparent;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  cursor: pointer;
  font-family: inherit;
  line-height: 1;
}

.jv-collapse:hover {
  color: var(--text-tab-hover);
}

.jv-spacer {
  display: inline-block;
  width: 1.1rem;
}

.jv-key { color: var(--accent); }
.jv-string { color: #98c379; }
.jv-number { color: #d19a66; }
.jv-bool { color: #e06c75; }
.jv-null { color: #abb2bf; }
.jv-punctuation { color: var(--text-secondary); }

.jv-badge {
  margin: 0 0.35rem;
  color: var(--text-label);
  font-size: 0.7rem;
}
</style>
