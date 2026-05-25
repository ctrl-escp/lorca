<template>
  <LeftPaneSectionShell
    :expanded="expanded"
    title="Step library"
    title-class="hdr-library"
    @toggle="$emit('toggle')"
  >
    <input
      v-model="stepLibraryQuery"
      class="palette-search"
      type="search"
      placeholder="Filter…"
      aria-label="Filter step types and suggestions"
    />
    <div class="step-library-list">
      <div
        v-for="group in filteredStepGroups"
        :key="group.type"
        class="type-group"
        :class="{expanded: typeExpanded(group.type)}"
      >
        <div class="type-group-header">
          <div class="type-group-info">
            <span class="type-group-name">{{ group.label }}</span>
            <span class="type-group-desc">{{ group.description }}</span>
          </div>
          <div class="type-group-actions">
            <button
              v-if="isPipelineContext"
              class="btn-insert-suggestion"
              type="button"
              title="Insert a blank step of this type"
              @click.stop="onInsertStepType(group.type)"
            >↓ Insert</button>
            <button
              v-if="group.suggestions.length > 0"
              type="button"
              class="type-group-expand"
              :aria-expanded="typeExpanded(group.type)"
              :title="typeExpanded(group.type) ? 'Collapse templates' : `Show ${group.suggestions.length} template(s)`"
              @click.stop="toggleTypeGroup(group.type)"
            >
              <span class="type-expand-chevron" :class="{open: typeExpanded(group.type)}">›</span>
              <span class="type-expand-count">{{ group.suggestions.length }}</span>
            </button>
          </div>
        </div>

        <div v-if="typeExpanded(group.type)" class="type-group-suggestions">
          <div
            v-for="suggestion in group.suggestions"
            :key="suggestion.id"
            class="suggestion-row"
            :title="isPipelineContext ? `${suggestion.description} — drag into the pipeline` : suggestion.description"
            @contextmenu.prevent.stop="openSuggestionContextMenu(suggestion, $event)"
          >
            <button
              v-if="isPipelineContext"
              type="button"
              class="row-drag-handle"
              draggable="true"
              title="Drag into pipeline"
              aria-label="Drag suggestion into pipeline"
              @dragstart="onSuggestionDragStart(suggestion.id, $event)"
              @dragend="onSuggestionDragEnd"
              @click.stop
            ><span class="row-drag-grip" aria-hidden="true">⠿</span></button>
            <div class="suggestion-row-main">
              <div class="suggestion-row-info">
                <span class="suggestion-row-name">{{ suggestion.name }}</span>
                <span class="suggestion-row-category">{{ suggestion.category }}</span>
              </div>
              <span class="suggestion-row-desc">{{ suggestion.description }}</span>
              <div v-if="isPipelineContext" class="suggestion-row-actions">
                <button
                  class="btn-insert-suggestion"
                  type="button"
                  title="Insert before selected step"
                  :disabled="!editorStore.selectedStepId"
                  @click.stop="onInsertSuggestion(suggestion, 'before')"
                >↑ Before</button>
                <button
                  class="btn-insert-suggestion"
                  type="button"
                  title="Insert after selected step (or append)"
                  @click.stop="onInsertSuggestion(suggestion, 'after')"
                >↓ After</button>
                <button
                  class="btn-insert-suggestion"
                  type="button"
                  title="Append to end of pipeline"
                  @click.stop="onInsertSuggestion(suggestion, 'append')"
                >+ Append</button>
                <button
                  class="btn-insert-suggestion btn-insert-new"
                  type="button"
                  title="Replace current pipeline with this suggestion"
                  @click.stop="onInsertSuggestion(suggestion, 'new')"
                >New</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <p v-if="filteredStepGroups.length === 0" class="empty-hint">No step types match your filter.</p>
    </div>

    <div v-if="isPipelineContext" class="ai-suggestions">
      <div class="ai-suggestions-header">
        <span class="ai-suggestions-title hdr-ai">AI suggestions</span>
        <button
          type="button"
          class="btn-ai-suggest"
          :disabled="advisorLoading || !hasAdvisorRunContext"
          :title="hasAdvisorRunContext ? 'Suggest next steps from the last run' : 'Run the pipeline first'"
          @click.stop="loadAiSuggestions"
        >{{ advisorLoading ? 'Thinking...' : 'Suggest' }}</button>
      </div>
      <div v-if="advisorError" class="advisor-banner">
        <div>
          <strong>{{ advisorError.message }}</strong>
          <pre v-if="advisorError.raw" class="advisor-raw">{{ advisorError.raw }}</pre>
        </div>
        <button type="button" class="advisor-dismiss" title="Dismiss" @click="advisorError = null">×</button>
      </div>
      <p v-else-if="!hasAdvisorRunContext" class="empty-hint">Run the pipeline to ask for next-step suggestions.</p>
      <div v-if="advisorCards.length" class="advisor-list">
        <div v-for="card in advisorCards" :key="card.suggestion.id" class="advisor-card">
          <div class="advisor-card-main">
            <span class="suggestion-row-name">{{ card.suggestion.name }}</span>
            <span class="suggestion-row-desc">{{ card.reason }}</span>
          </div>
          <button
            class="btn-insert-suggestion"
            type="button"
            title="Append to end of pipeline"
            @click.stop="onInsertSuggestion(card.suggestion, 'append')"
          >↓ Insert</button>
        </div>
      </div>
    </div>
  </LeftPaneSectionShell>
</template>

<script setup lang="ts">
import {ref, computed, inject, onUnmounted, watch} from 'vue';
import type {StepType} from '@lorca/core';
import {ALL_SUGGESTIONS} from '@lorca/capsules';
import type {PipelineSuggestion} from '@lorca/capsules';
import {autoAssignModelToStep} from '@lorca/endpoints';
import {useUiStore} from '../../stores/ui.js';
import {useEndpointsStore} from '../../stores/endpoints.js';
import {useModelsStore} from '../../stores/models.js';
import {usePipelineEditorStore} from '../../stores/pipelineEditor.js';
import {useActiveStepEditor} from '../../composables/useActiveStepEditor.js';
import {useSuggestionInsert} from '../../composables/useSuggestionInsert.js';
import {useStepAdvisor} from '../../composables/useStepAdvisor.js';
import {useActiveRunStore} from '../../stores/activeRun.js';
import {DND_BODY_SUGGESTION, DND_SUGGESTION_ID} from '../../utils/dragDrop.js';
import {
  filterStepGroups,
  groupSuggestionsByType,
  isTypeGroupExpanded,
  STEP_TYPE_ENTRIES,
} from '../../utils/stepLibraryGroups.js';
import {LEFT_PANE_CONTEXT_MENU_KEY, SUGGESTION_REPLACE_KEY} from './injection.js';
import LeftPaneSectionShell from './LeftPaneSectionShell.vue';

defineProps<{expanded: boolean}>();
defineEmits<{toggle: []}>();

const uiStore = useUiStore();
const endpointsStore = useEndpointsStore();
const modelsStore = useModelsStore();
const pipelineEditorStore = usePipelineEditorStore();
const editorStore = useActiveStepEditor();
const suggestionInsert = useSuggestionInsert();
const stepAdvisor = useStepAdvisor();
const runStore = useActiveRunStore();
const contextMenu = inject(LEFT_PANE_CONTEXT_MENU_KEY)!;
const confirmSuggestionReplace = inject(SUGGESTION_REPLACE_KEY)!;

const isPipelineContext = computed(() => uiStore.editorContext === 'pipeline');
const stepLibraryQuery = ref('');
const expandedTypeGroups = ref<Set<StepType>>(new Set(STEP_TYPE_ENTRIES.map((e) => e.type)));
const advisorLoading = ref(false);
const advisorSuggestions = ref<{suggestionId: string; reason: string}[]>([]);
const advisorError = ref<{message: string; raw?: string} | null>(null);
let advisorAbort: AbortController | null = null;

const suggestionsByType = computed(() => groupSuggestionsByType(ALL_SUGGESTIONS));
const filteredStepGroups = computed(() => filterStepGroups(stepLibraryQuery.value, suggestionsByType.value));

function typeExpanded(type: StepType): boolean {
  return isTypeGroupExpanded(type, stepLibraryQuery.value, expandedTypeGroups.value, filteredStepGroups.value);
}

function toggleTypeGroup(type: StepType) {
  const next = new Set(expandedTypeGroups.value);
  if (next.has(type)) next.delete(type);
  else next.add(type);
  expandedTypeGroups.value = next;
}

const advisorArtifactKeys = computed(() => Object.keys(runStore.artifacts).sort());
const hasAdvisorRunContext = computed(() =>
  isPipelineContext.value &&
  !runStore.isRunning &&
  runStore.status !== 'idle' &&
  advisorArtifactKeys.value.length > 0,
);
const advisorCards = computed(() =>
  advisorSuggestions.value.flatMap((entry) => {
    const suggestion = ALL_SUGGESTIONS.find((s) => s.id === entry.suggestionId);
    return suggestion ? [{suggestion, reason: entry.reason}] : [];
  }),
);

onUnmounted(() => advisorAbort?.abort());
watch(() => runStore.runId, () => {
  advisorSuggestions.value = [];
  advisorError.value = null;
});

function onSuggestionDragStart(suggestionId: string, event: DragEvent) {
  if (!isPipelineContext.value) return;
  document.body.classList.add('lorca-dnd-active', DND_BODY_SUGGESTION);
  event.dataTransfer?.setData(DND_SUGGESTION_ID, suggestionId);
  event.dataTransfer!.effectAllowed = 'copy';
}

function onSuggestionDragEnd() {
  document.body.classList.remove('lorca-dnd-active', DND_BODY_SUGGESTION);
}

type SuggestionInsertMode = 'before' | 'after' | 'append' | 'new';

async function onInsertSuggestion(suggestion: PipelineSuggestion, mode: SuggestionInsertMode) {
  if (!isPipelineContext.value) return;
  if (mode === 'new') {
    if (runStore.isRunning) runStore.cancel();
    runStore.reset();
  }
  await suggestionInsert.insertSuggestion(suggestion, mode, {
    confirmReplace: () => confirmSuggestionReplace(suggestion.name),
  });
}

function openSuggestionContextMenu(suggestion: PipelineSuggestion, event: MouseEvent) {
  contextMenu.open(
    event,
    [
      {id: 'insert-before', label: 'Insert before selected step', disabled: !isPipelineContext.value || !editorStore.selectedStepId},
      {id: 'insert-after', label: 'Insert after selected step', disabled: !isPipelineContext.value},
      {id: 'append', label: 'Append to pipeline', disabled: !isPipelineContext.value},
      {id: 'sep-new', separator: true},
      {id: 'new', label: 'Replace pipeline with this', disabled: !isPipelineContext.value, danger: true},
    ],
    {
      'insert-before': () => { void onInsertSuggestion(suggestion, 'before'); },
      'insert-after': () => { void onInsertSuggestion(suggestion, 'after'); },
      append: () => { void onInsertSuggestion(suggestion, 'append'); },
      new: () => { void onInsertSuggestion(suggestion, 'new'); },
    },
  );
}

function onInsertStepType(type: StepType) {
  if (!isPipelineContext.value) return;
  let step = editorStore.buildDefaultStep(type);
  const disabledEpIds = new Set(endpointsStore.endpoints.filter((e) => !e.enabled).map((e) => e.id));
  const enabledModels = modelsStore.models.filter((m) => m.enabled !== false && !disabledEpIds.has(m.endpointId));
  step = autoAssignModelToStep(step, enabledModels, type === 'model-call' ? 'general' : undefined);
  const anchorId = editorStore.selectedStepId;
  const id = anchorId ? editorStore.insertStepAfter(anchorId, step) : editorStore.appendStep(step);
  editorStore.selectStep(id);
}

async function loadAiSuggestions() {
  if (!hasAdvisorRunContext.value) return;
  advisorAbort?.abort();
  const controller = new AbortController();
  advisorAbort = controller;
  advisorLoading.value = true;
  advisorError.value = null;

  try {
    const result = await stepAdvisor.getStepSuggestions(
      pipelineEditorStore.pipeline,
      advisorArtifactKeys.value,
      ALL_SUGGESTIONS,
      controller.signal,
    );
    if (controller.signal.aborted) return;
    if (result.ok) {
      advisorSuggestions.value = result.suggestions;
    } else {
      advisorSuggestions.value = [];
      advisorError.value = {
        message: result.message,
        ...(result.rawResponse ? {raw: result.rawResponse} : {}),
      };
    }
  } catch (error) {
    if (controller.signal.aborted) return;
    advisorSuggestions.value = [];
    advisorError.value = {message: error instanceof Error ? error.message : 'AI suggestions failed'};
  } finally {
    if (advisorAbort === controller) {
      advisorAbort = null;
      advisorLoading.value = false;
    }
  }
}
</script>

<style scoped>
.palette-search {
  width: 100%;
  background: #111;
  border: 1px solid #2a2a2a;
  color: #ccc;
  border-radius: 5px;
  padding: 8px 12px;
  font-size: 0.9rem;
  margin-bottom: 0.2rem;
}
.palette-search:focus { outline: none; border-color: var(--accent-border); }

.step-library-list { display: flex; flex-direction: column; gap: 0.35rem; }

.type-group {
  border: 1px solid #222;
  border-radius: 6px;
  background: #161616;
  overflow: hidden;
}
.type-group.expanded { border-color: #2a3d4a; }

.type-group-header {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.65rem 0.75rem;
}
.type-group:hover .type-group-header { background: #181c22; }
.type-group.expanded .type-group-header { background: #0f161c; }

.type-group-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.type-group-name { font-size: 0.95rem; font-weight: 600; color: #ddd; }
.type-group-desc { font-size: 0.76rem; color: var(--text-secondary); line-height: 1.35; }

.type-group-actions {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  flex-shrink: 0;
}

.type-group-expand {
  display: flex;
  align-items: center;
  gap: 0.15rem;
  background: none;
  border: 1px solid #2a2a2a;
  border-radius: 4px;
  color: var(--text-secondary);
  padding: 4px 6px;
  cursor: pointer;
  font-size: 0.75rem;
  line-height: 1;
  white-space: nowrap;
}
.type-group-expand:hover { background: var(--border-divider); color: var(--text-secondary); border-color: #3a3a3a; }
.type-group.expanded .type-group-expand { color: var(--accent); border-color: var(--accent-border); background: var(--accent-bg); }

.type-expand-chevron {
  display: inline-block;
  font-size: 1rem;
  color: inherit;
  transition: transform 0.15s;
}
.type-expand-chevron.open { transform: rotate(90deg); }
.type-expand-count { font-size: 0.72rem; color: inherit; }

.type-group-suggestions {
  border-top: 1px solid #1e2a32;
  display: flex;
  flex-direction: column;
  gap: 0;
}
.type-group-suggestions .suggestion-row {
  border-radius: 0;
  border: none;
  border-bottom: 1px solid #1a1a1a;
  background: #0f0f0f;
}
.type-group-suggestions .suggestion-row:last-child { border-bottom: none; }
.type-group-suggestions .suggestion-row:hover { background: #141a14; border-color: transparent; }

.suggestion-row {
  display: flex; align-items: stretch;
  border-radius: 6px; border: 1px solid #222; background: #161616;
  overflow: hidden;
}
.suggestion-row:hover { border-color: #2a3d2a; background: #191f19; }
.row-drag-handle {
  flex-shrink: 0;
  align-self: stretch;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  padding: 0;
  border: none;
  border-right: 1px solid #2a2a2a;
  border-radius: 6px 0 0 6px;
  background: #121612;
  color: #5a7a5a;
  cursor: grab;
}
.row-drag-grip {
  font-size: 1rem;
  line-height: 1;
  letter-spacing: -0.12em;
  user-select: none;
}
.row-drag-handle:hover { background: #1a221a; color: #8ab88a; }
.row-drag-handle:active { cursor: grabbing; }
.suggestion-row-main {
  flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.2rem;
  padding: 0.65rem 0.75rem;
}
.suggestion-row-info {
  display: flex; align-items: baseline; gap: 0.5rem; flex-wrap: wrap;
}
.suggestion-row-name { font-size: 1rem; font-weight: 600; }
.suggestion-row-desc { font-size: 0.78rem; color: var(--text-label); line-height: 1.35; }
.suggestion-row-category { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: #5a8a5a; }
.suggestion-row-actions {
  display: flex; flex-wrap: wrap; gap: 0.3rem;
  padding-top: 0.45rem;
}
.btn-insert-new { background: #2d1a1a; border-color: #4d2a2a; color: #b86d6d; }
.btn-insert-new:hover { background: #381e1e; color: #da8d8d; }
.btn-insert-suggestion:disabled { opacity: 0.35; cursor: default; }
.btn-insert-suggestion {
  font-size: 0.82rem; padding: 5px 11px;
  background: #1a2d1a; border: 1px solid #2a4d2a; color: #6db86d;
  border-radius: 5px; cursor: pointer; white-space: nowrap;
}
.btn-insert-suggestion:hover { background: #1e381e; color: #8dda8d; }

.ai-suggestions {
  margin-top: 0.85rem;
  padding-top: 0.75rem;
  border-top: 1px solid #242424;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.ai-suggestions-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.ai-suggestions-title {
  font-size: 0.76rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 600;
}
.btn-ai-suggest {
  font-size: 0.78rem;
  padding: 5px 10px;
  background: #1a2630;
  border: 1px solid #2b4c62;
  color: #80c7df;
  border-radius: 5px;
  cursor: pointer;
}
.btn-ai-suggest:hover:not(:disabled) { background: #203444; color: #9adcf0; }
.btn-ai-suggest:disabled { opacity: 0.45; cursor: default; }
.advisor-banner {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.55rem 0.65rem;
  border: 1px solid #4b3020;
  border-radius: 6px;
  background: #221813;
  color: #d89a72;
  font-size: 0.78rem;
}
.advisor-dismiss {
  border: none;
  background: transparent;
  color: #d89a72;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
}
.advisor-raw {
  max-height: 8rem;
  overflow: auto;
  white-space: pre-wrap;
  margin: 0.4rem 0 0;
  color: #b98b70;
  font-size: 0.72rem;
}
.advisor-list {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.advisor-card {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.6rem 0.7rem;
  border: 1px solid #263326;
  border-radius: 6px;
  background: #141a14;
}
.advisor-card-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.empty-hint { font-size: 0.88rem; color: var(--text-secondary); margin: 0; }
</style>
