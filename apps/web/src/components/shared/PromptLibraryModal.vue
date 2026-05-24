<template>
  <Teleport to="body">
    <div v-if="open" class="plm-backdrop" @click.self="emit('close')">
      <div class="plm-dialog" role="dialog" aria-modal="true" aria-label="Browse role prompts">
        <div class="plm-header">
          <span class="plm-title">Browse role prompts</span>
          <button class="plm-close" type="button" title="Close" @click="emit('close')">×</button>
        </div>

        <input
          ref="searchRef"
          v-model="query"
          class="plm-search"
          type="search"
          placeholder="Search roles…"
          @keydown.esc="emit('close')"
        />

        <div class="plm-split">
          <div class="plm-list-pane">
            <div v-if="filteredEntries.length === 0" class="plm-empty">
              {{ entries.length === 0 ? 'No role prompts available.' : 'No role prompts match your search.' }}
            </div>
            <ul v-else class="plm-list" role="listbox" aria-label="Role prompts">
              <li
                v-for="entry in filteredEntries"
                :key="entry.id"
                class="plm-item"
                :class="{selected: selected?.id === entry.id}"
                role="option"
                :aria-selected="selected?.id === entry.id"
                tabindex="0"
                @click="selectEntry(entry)"
                @keydown.enter="selectEntry(entry)"
              >
                <div class="plm-item-head">
                  <span class="plm-item-label">{{ entry.role }}</span>
                  <span class="plm-item-kind">{{ sourceLabel(entry.source) }}</span>
                </div>
                <div class="plm-item-group">{{ entry.category }}</div>
              </li>
            </ul>
          </div>

          <div class="plm-preview-pane">
            <template v-if="selected">
              <div class="plm-review-meta">
                <div class="plm-review-head">
                  <span class="plm-review-role">{{ selected.role }}</span>
                  <span class="plm-item-kind">{{ sourceLabel(selected.source) }}</span>
                </div>
                <div class="plm-review-category">{{ selected.category }}</div>
              </div>
              <pre class="plm-review-body">{{ selected.text }}</pre>
            </template>
            <div v-else class="plm-preview-empty">
              Select a role prompt to preview its content.
            </div>
          </div>
        </div>

        <div class="plm-footer">
          <button type="button" class="plm-btn plm-btn-cancel" @click="emit('close')">Cancel</button>
          <button
            type="button"
            class="plm-btn plm-btn-confirm"
            :disabled="!selected"
            @click="confirmSelection"
          >Use this template</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import {computed, nextTick, ref, watch} from 'vue';
import type {StepRolePromptSource, StepRolePromptTemplate} from '../../utils/stepRolePromptCatalog.js';

const props = defineProps<{
  open: boolean;
  entries: readonly StepRolePromptTemplate[];
}>();

const emit = defineEmits<{
  close: [];
  select: [text: string];
}>();

const query = ref('');
const selected = ref<StepRolePromptTemplate | null>(null);
const searchRef = ref<HTMLInputElement | null>(null);

watch(() => props.open, async (open) => {
  if (!open) {
    query.value = '';
    selected.value = null;
    return;
  }
  selected.value = props.entries[0] ?? null;
  await nextTick();
  searchRef.value?.focus();
});

const filteredEntries = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return props.entries;
  return props.entries.filter((entry) =>
    entry.role.toLowerCase().includes(q)
    || entry.category.toLowerCase().includes(q)
    || entry.text.toLowerCase().includes(q),
  );
});

watch(filteredEntries, (entries) => {
  if (entries.length === 0) {
    selected.value = null;
    return;
  }
  if (!selected.value || !entries.some((e) => e.id === selected.value!.id)) {
    selected.value = entries[0]!;
  }
});

function sourceLabel(source: StepRolePromptSource): string {
  return source === 'suggestion' ? 'Built-in step' : 'Example capsule';
}

function selectEntry(entry: StepRolePromptTemplate) {
  selected.value = entry;
}

function confirmSelection() {
  if (!selected.value) return;
  emit('select', selected.value.text);
  emit('close');
}
</script>

<style scoped>
.plm-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9000;
}

.plm-dialog {
  background: #141414;
  border: 1px solid #2a2a2a;
  border-radius: 6px;
  width: min(960px, 94vw);
  height: min(640px, 85vh);
  display: flex;
  flex-direction: column;
}

.plm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.6rem 0.8rem;
  border-bottom: 1px solid #222;
  flex-shrink: 0;
}

.plm-title {
  font-size: 0.85rem;
  color: #e8e8e8;
  font-weight: 600;
}

.plm-close {
  background: none;
  border: none;
  color: var(--text-label);
  font-size: 1.1rem;
  cursor: pointer;
  line-height: 1;
  padding: 0 2px;
}
.plm-close:hover { color: #e07070; }

.plm-search {
  margin: 0.65rem 0.8rem 0;
  background: #111;
  border: 1px solid #2a2a2a;
  color: #e8e8e8;
  border-radius: 4px;
  padding: 6px 10px;
  font-size: 0.85rem;
  flex-shrink: 0;
}
.plm-search:focus { outline: none; border-color: var(--accent-border); }

.plm-split {
  display: flex;
  flex: 1;
  min-height: 0;
  margin-top: 0.65rem;
  border-top: 1px solid #222;
}

.plm-list-pane {
  width: 38%;
  min-width: 220px;
  border-right: 1px solid #222;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.plm-preview-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
}

.plm-empty,
.plm-preview-empty {
  padding: 1.25rem 0.8rem;
  font-size: 0.82rem;
  color: var(--text-secondary);
}

.plm-preview-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 2rem;
}

.plm-list {
  list-style: none;
  margin: 0;
  padding: 0.4rem;
  overflow-y: auto;
  flex: 1;
}

.plm-item {
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 0.55rem 0.65rem;
  margin-bottom: 0.25rem;
  cursor: pointer;
  background: transparent;
}
.plm-item:hover,
.plm-item:focus {
  outline: none;
  background: #151515;
}
.plm-item.selected {
  background: #1a2228;
  border-color: var(--accent-border);
}

.plm-item-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
}

.plm-item-label {
  font-size: 0.82rem;
  color: #e8e8e8;
  font-weight: 500;
}

.plm-item-kind {
  font-size: 0.68rem;
  color: var(--text-label);
  flex-shrink: 0;
}

.plm-item-group {
  font-size: 0.72rem;
  color: var(--text-secondary);
  margin-top: 0.15rem;
}

.plm-review-meta {
  padding: 0.65rem 0.8rem 0.45rem;
  border-bottom: 1px solid #222;
  flex-shrink: 0;
}

.plm-review-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
}

.plm-review-role {
  font-size: 0.88rem;
  color: #e8e8e8;
  font-weight: 600;
}

.plm-review-category {
  font-size: 0.72rem;
  color: var(--text-secondary);
  margin-top: 0.2rem;
}

.plm-review-body {
  flex: 1;
  overflow-y: auto;
  margin: 0;
  padding: 0.75rem 0.9rem;
  font-size: 0.78rem;
  font-family: monospace;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  color: #ccc;
  background: #0d0d0d;
}

.plm-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.55rem 0.8rem;
  border-top: 1px solid #222;
  flex-shrink: 0;
}

.plm-btn {
  font-size: 0.78rem;
  padding: 5px 12px;
  border-radius: 4px;
  cursor: pointer;
  border: 1px solid #333;
}

.plm-btn-cancel {
  background: #1a1a1a;
  color: var(--text-label);
}
.plm-btn-cancel:hover {
  background: #222;
  color: #ccc;
}

.plm-btn-confirm {
  background: var(--accent-bg);
  border-color: var(--accent-border);
  color: var(--accent);
}
.plm-btn-confirm:hover:not(:disabled) {
  background: var(--accent-bg-hover);
}
.plm-btn-confirm:disabled {
  opacity: 0.4;
  cursor: default;
}

@media (max-width: 640px) {
  .plm-dialog {
    height: min(720px, 92vh);
  }

  .plm-split {
    flex-direction: column;
  }

  .plm-list-pane {
    width: auto;
    max-height: 40%;
    border-right: none;
    border-bottom: 1px solid #222;
  }
}
</style>
