<template>
  <div
    class="chain-editor"
    :class="{'dnd-active': isDndActive, [`dnd-kind-${activeDragKind}`]: activeDragKind}"
    :style="{'--chain-visible-step-count': Math.max(1, Math.min(steps.length || 1, 4))}"
  >
    <div class="chain-viewport">
      <div
        ref="scrollRef"
        class="chain-scroll"
        @dragenter="onChainDragEnter"
        @dragleave="onChainDragLeave"
      >
        <div class="chain-scroll-spacer" aria-hidden="true" />

        <!-- Insert-at-start button (shown when steps exist) -->
        <div
          v-if="steps.length > 0"
          class="insert-zone insert-zone-top"
          :class="{'drop-target-active': dropTargetIndex === 0}"
          @dragover.prevent="onInsertZoneDragOver(0, $event)"
          @dragleave="onInsertZoneDragLeave(0, $event)"
          @drop.prevent="onInsertZoneDrop(0, $event)"
        >
          <DropSlotIndicator
            :active="dropTargetIndex === 0"
            :ghost="isDndActive && dropTargetIndex !== 0"
            :label="dropHintAtIndex(0)"
          />
          <button
            v-show="!isDndActive || dropTargetIndex !== 0"
            class="btn-insert"
            title="Insert step at beginning"
            @click="$emit('insert-at', 0)"
          >+</button>
        </div>

        <template v-for="(step, i) in steps" :key="step.id">
          <div
            :ref="(el) => setStepRef(step.id, el as HTMLElement | null)"
            class="chain-step"
            :class="{
              selected: selectedStepId === step.id,
              'in-selection-range': isInSelectionRange(step.id),
              disabled: !step.enabled,
              'model-disabled': props.disabledModelStepIds?.has(step.id),
              'drop-target-step': dragOverStepId === step.id && activeDragKind === 'step-reorder',
              dragging: draggingStepId === step.id,
              'output-expanded': outputPreviewValueFor(step) !== null && !isStepOutputCollapsed(step.id),
              'partial-run-target': step.id === props.partialRunTargetStepId,
              [traceStatusClass(step.id)]: true,
            }"
            @click="onStepClick(step.id, $event)"
            @dragover.prevent="onStepDragOver(step.id, i, $event)"
            @dragleave="onStepDragLeave(step.id, $event)"
            @drop.prevent="onStepDrop(step.id, i, $event)"
          >
            <div v-if="i > 0" class="step-connector">↓</div>
            <div
              class="step-card"
              @dragend="onStepDragEnd"
            >
              <div
                class="step-drag-handle"
                aria-hidden="true"
                draggable="true"
                title="Drag to reorder"
                @dragstart="onStepDragStart(step.id, $event)"
              >
                <span class="step-drag-grip">⠿</span>
              </div>
              <div class="step-card-content">
              <div class="step-card-header">
                <span class="step-type-badge" :class="`badge-${step.type}`">{{ stepTypeLabel(step.type) }}</span>
                <span
                  v-if="step.config.type === 'model-call' && step.config.outputType === 'json'"
                  class="step-badge step-badge-json"
                  :class="{'step-badge-json-fail': jsonValidFailed(step)}"
                  title="JSON (strict): step fails if output is not valid JSON"
                >JSON</span>
                <span
                  v-else-if="step.config.type === 'model-call' && (!step.config.outputType || step.config.outputType === 'auto') && jsonValidKnown(step)"
                  class="step-badge step-badge-json"
                  :class="{'step-badge-json-fail': !jsonValidPassed(step)}"
                  :title="jsonValidPassed(step) ? 'Last run parsed as JSON' : 'Last run output was not valid JSON'"
                >{{ jsonValidPassed(step) ? 'JSON✓' : 'JSON✗' }}</span>
                <span class="step-title" :class="{disabled: !step.enabled}">{{ step.label }}</span>
                <span v-if="stepHasModelError(step)" class="step-badge step-badge-warn" title="No model selected">no model</span>
                <span v-if="props.disabledModelStepIds?.has(step.id)" class="step-badge step-badge-model-off" title="This step's model or endpoint is disabled">model off</span>
                <div class="step-actions">
                  <button
                    v-if="step.enabled"
                    type="button"
                    class="btn-run-up-to icon-btn"
                    aria-label="Run up to here"
                    @click.stop="$emit('run-up-to', step.id)"
                    title="Execute pipeline up to this step"
                  >
                    <StepIcon name="play" />
                  </button>
                  <button
                    v-if="step.enabled"
                    type="button"
                    class="btn-run-from icon-btn"
                    aria-label="Run from here"
                    @click.stop="$emit('run-from', step.id)"
                    title="Run from this step to the end (reuses previous outputs for earlier steps)"
                  >
                    <StepIcon name="play-from" />
                  </button>
                  <button
                    v-if="step.enabled"
                    type="button"
                    class="btn-run-only-step icon-btn"
                    aria-label="Re-run only this step"
                    @click.stop="$emit('run-only-step', step.id)"
                    title="Re-run only this step (reuses previous outputs for other steps)"
                  >
                    <StepIcon name="refresh" />
                  </button>
                  <button class="icon-btn" :disabled="i === 0" @click.stop="$emit('move-up', step.id)" title="Move up" aria-label="Move up">
                    <StepIcon name="arrow-up" />
                  </button>
                  <button class="icon-btn" :disabled="i === steps.length - 1" @click.stop="$emit('move-down', step.id)" title="Move down" aria-label="Move down">
                    <StepIcon name="arrow-down" />
                  </button>
                  <button class="icon-btn" @click.stop="$emit('duplicate', step.id)" title="Duplicate step" aria-label="Duplicate step">
                    <StepIcon name="copy" />
                  </button>
                  <button class="icon-btn" @click.stop="$emit('toggle-enabled', step.id)" :title="step.enabled ? 'Disable step' : 'Enable step'" :aria-label="step.enabled ? 'Disable step' : 'Enable step'">
                    <StepIcon :name="step.enabled ? 'eye-off' : 'eye'" />
                  </button>
                  <button class="icon-btn danger" @click.stop="$emit('delete', step.id)" title="Delete step" aria-label="Delete step">
                    <StepIcon name="trash" />
                  </button>
                  <button
                    class="icon-btn"
                    :class="{'comment-has-content': step.description}"
                    @click.stop="toggleComment(step)"
                    :title="step.description ? 'Edit comment' : 'Add comment'"
                    :aria-label="step.description ? 'Edit comment' : 'Add comment'"
                  >
                    <StepIcon name="message-square" />
                  </button>
                </div>
              </div>

              <div class="step-meta">
                <span v-if="step.type === 'model-call' && step.config.type === 'model-call' && step.config.modelRef.kind !== 'slot'" class="step-meta-item">
                  <span class="step-meta-label">Model</span>
                  <span class="step-model">{{ step.config.modelRef.modelName || '— no model —' }}{{ step.config.modelRef.kind === 'any-enabled-endpoint' ? ' (any enabled endpoint)' : '' }}</span>
                </span>
                <span class="step-meta-item">
                  <span class="step-meta-label">Outputs</span>
                  <span class="step-namespace">{{ step.outputNamespace }}.*</span>
                </span>
                <span v-if="historyReadCount(step) > 0" class="step-meta-item">
                  <span class="step-meta-label">History reads</span>
                  <span class="step-history-badge" :title="`${historyReadCount(step)} history read(s)`">{{ historyReadCount(step) }}</span>
                </span>
                <span v-if="runStateFor(step.id)" class="step-meta-item">
                  <span class="step-meta-label">Result</span>
                  <span
                    class="step-run-badge"
                    :class="`run-${runStateFor(step.id)}`"
                    :title="runStateTitle(step.id)"
                  >{{ stepRunUiStateLabel(runStateFor(step.id)!) }}</span>
                </span>
                <span v-if="!step.enabled" class="step-disabled-badge">disabled</span>
              </div>

              <div v-if="step.config.type === 'loop-group'" class="loop-group-body">
                <div class="loop-group-banner" :title="loopExitSummary(step)">
                  <span class="loop-group-icon">↺</span>
                  <span>Up to {{ step.config.maxIterations }}×</span>
                  <span class="loop-group-dot">·</span>
                  <span class="loop-group-exit">{{ loopExitSummary(step) }}</span>
                </div>
                <div v-if="step.config.steps.length === 0" class="loop-inner-empty">
                  Empty loop — add inner steps in the Inspector
                </div>
                <ol v-else class="loop-inner-list">
                  <li
                    v-for="(inner, ii) in step.config.steps"
                    :key="inner.id"
                    class="loop-inner-item"
                    :class="{
                      'loop-inner-selected': selectedLoopInnerStepId === inner.id && selectedStepId === step.id,
                      'loop-inner-last': ii === step.config.steps.length - 1,
                    }"
                    :title="ii === step.config.steps.length - 1 ? 'Last step — its JSON output controls loop exit' : 'Click to configure inner step'"
                    @click.stop="$emit('select-loop-inner', step.id, inner.id)"
                  >
                    <span class="loop-inner-index">{{ ii + 1 }}</span>
                    <span class="loop-inner-type">{{ stepTypeLabel(inner.type) }}</span>
                    <span class="loop-inner-label">{{ inner.label }}</span>
                    <span v-if="ii === step.config.steps.length - 1" class="loop-inner-exit-badge">exit check</span>
                  </li>
                </ol>
                <p class="loop-prev-hint">On retry: <code>loop.prev.text</code> = previous iteration's verifier output</p>
              </div>

              <div v-if="step.description || isCommentExpanded(step.id)" class="step-comment-wrap">
                <button
                  type="button"
                  class="step-comment-header"
                  :aria-expanded="isCommentExpanded(step.id)"
                  @click.stop="toggleComment(step)"
                >
                  <span class="step-comment-toggle">{{ isCommentExpanded(step.id) ? '−' : '+' }}</span>
                  <span v-if="!isCommentExpanded(step.id) && step.description" class="step-comment-preview">{{ step.description }}</span>
                  <span v-else class="step-comment-label">Comment</span>
                </button>
                <textarea
                  v-if="isCommentExpanded(step.id)"
                  class="step-comment-textarea"
                  :value="commentDrafts[step.id] ?? ''"
                  placeholder="Add a comment…"
                  rows="3"
                  @input="commentDrafts[step.id] = ($event.target as HTMLTextAreaElement).value"
                  @click.stop
                  @keydown.stop
                />
                <div v-if="isCommentExpanded(step.id)" class="step-comment-actions">
                  <button class="btn btn-sm btn-primary" type="button" @click.stop="saveComment(step.id)">Save</button>
                  <button class="btn btn-sm btn-ghost" type="button" @click.stop="cancelComment(step)">Cancel</button>
                </div>
              </div>

              <div v-if="sourceBadgesByStepId[step.id]?.length" class="step-source-badges" aria-label="Step data sources">
                <span class="step-source-label">From</span>
                <span
                  v-for="source in sourceBadgesByStepId[step.id]"
                  :key="source.key"
                  class="step-source-badge"
                  :class="`source-${source.kind}`"
                  :title="source.kind === 'previous' ? `${source.title} — change this input first when reordering steps` : source.title"
                >
                  <span v-if="source.kind === 'previous'" class="prev-output-marker" aria-hidden="true">↑</span>{{ source.label }}
                </span>
              </div>

              <div v-if="traceFor(step.id)" class="step-trace">
                <span class="step-meta-item">
                  <span class="step-meta-label">Execution status</span>
                  <span :class="`status-${traceFor(step.id)!.status}`">{{ traceFor(step.id)!.status }}</span>
                </span>
                <span v-if="traceFor(step.id)!.durationMs !== undefined" class="step-meta-item">
                  <span class="step-meta-label">Duration</span>
                  <span class="step-duration">{{ traceFor(step.id)!.durationMs }}ms</span>
                </span>
              </div>

              <div v-if="outputPreviewValueFor(step) !== null" class="step-output-preview-wrap">
                <button
                  type="button"
                  class="step-output-preview-header"
                  :aria-expanded="!isStepOutputCollapsed(step.id)"
                  :title="isStepOutputCollapsed(step.id) ? 'Expand output preview' : 'Collapse output preview'"
                  @click.stop="toggleStepOutput(step.id)"
                >
                  <span class="step-output-toggle-indicator">{{ isStepOutputCollapsed(step.id) ? '+' : '-' }}</span>
                  <span class="step-output-preview-label">Output preview</span>
                </button>
                <JsonViewer
                  v-if="!isStepOutputCollapsed(step.id)"
                  class="step-output-preview"
                  :value="outputPreviewValueFor(step)"
                  :show-header="false"
                />
              </div>

              <div
                v-if="dragOverStepId === step.id && activeDragKind === 'step-reorder'"
                class="step-drop-banner"
                aria-live="polite"
              >{{ dropHintAtIndex(i) }}</div>
              </div>
            </div>
          </div>

          <!-- Insert between steps -->
          <div
            class="insert-zone"
            :class="{'drop-target-active': dropTargetIndex === i + 1}"
            @dragover.prevent="onInsertZoneDragOver(i + 1, $event)"
            @dragleave="onInsertZoneDragLeave(i + 1, $event)"
            @drop.prevent="onInsertZoneDrop(i + 1, $event)"
          >
            <DropSlotIndicator
              :active="dropTargetIndex === i + 1"
              :ghost="isDndActive && dropTargetIndex !== i + 1"
              :label="dropHintAtIndex(i + 1)"
            />
            <button
              v-show="!isDndActive || dropTargetIndex !== i + 1"
              class="btn-insert"
              :title="`Insert step after ${step.label}`"
              @click="$emit('insert-after', step.id)"
            >+</button>
          </div>
        </template>

        <!-- Empty state -->
        <div
          v-if="steps.length === 0"
          class="chain-empty"
          :class="{'drop-target-active': dropTargetIndex === 0}"
          @dragover.prevent="onInsertZoneDragOver(0, $event)"
          @dragleave="onInsertZoneDragLeave(0, $event)"
          @drop.prevent="onInsertZoneDrop(0, $event)"
        >
          <DropSlotIndicator
            v-if="isDndActive"
            :active="dropTargetIndex === 0"
            :ghost="dropTargetIndex !== 0"
            :label="dropHintAtIndex(0)"
          />
          <template v-else>
            <p>No steps yet.</p>
            <p v-if="acceptSuggestionDrop" class="chain-empty-hint">Drag a Step Suggestion here, or add a step below.</p>
          </template>
          <button class="btn btn-accent btn-sm" @click="$emit('append', 'model-call')">+ Add Model Call</button>
        </div>

        <!-- Final output indicator -->
        <div v-if="steps.length > 0" class="chain-output-ref">
          <span class="output-label">{{ runPartial ? 'Partial output' : 'Output' }}</span>
          <span class="output-key">{{ finalArtifactKey ?? '(none)' }}</span>
        </div>

        <div class="chain-scroll-spacer" aria-hidden="true" />
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import {ref, reactive, computed, watch, nextTick, onMounted, onUnmounted, defineComponent, h} from 'vue';
import {PIPELINE_INPUT_STEP_ID, type PipelineArtifact, type PipelineStep, type PipelineTraceEvent, type StepType} from '@lorca/core';
import {getStepHistoryReads, stepRunUiStateLabel, formatLoopExitSummary} from '@lorca/pipeline';
import type {StepStaleState} from '@lorca/pipeline';
import {
  DND_STEP_ID,
  isSuggestionDragActive,
  readDragStepId,
  readDragSuggestionId,
} from '../../utils/dragDrop.js';
import {JsonViewer} from '@lorca/ui-kit';
import {formatArtifactDisplay} from '../../utils/formatArtifact.js';

type DragKind = 'step-reorder' | 'suggestion';

type StepDataSourceKind = 'previous' | 'history' | 'template' | 'binding' | 'direct';

interface StepDataSourceBadge {
  key: string;
  label: string;
  title: string;
  kind: StepDataSourceKind;
}

const DropSlotIndicator = defineComponent({
  name: 'DropSlotIndicator',
  props: {
    active: {type: Boolean, required: true},
    ghost: {type: Boolean, required: true},
    label: {type: String, required: true},
  },
  setup(props) {
    return () => {
      if (!props.active && !props.ghost) return null;
      return h(
        'div',
        {
          class: [
            'drop-slot-card',
            props.active ? 'drop-slot-card-active' : 'drop-slot-card-ghost',
          ],
          ...(props.active ? {'aria-label': props.label} : {'aria-hidden': 'true'}),
        },
        [
          h('div', {class: 'drop-slot-card-inner'}, [
            props.active
              ? h('span', {class: 'drop-slot-label'}, props.label)
              : null,
          ]),
        ],
      );
    };
  },
});

const ICON_PATHS: Record<string, string[]> = {
  'arrow-up': ['M12 19V5', 'M5 12l7-7 7 7'],
  'arrow-down': ['M12 5v14', 'M19 12l-7 7-7-7'],
  copy: ['M8 8h10v10H8z', 'M6 14H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1'],
  eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  'eye-off': ['M3 3l18 18', 'M10.6 10.6a3 3 0 0 0 4.2 4.2', 'M9.9 4.2A10.8 10.8 0 0 1 12 4c6.5 0 10 8 10 8a18 18 0 0 1-3.1 4.2', 'M6.6 6.6C3.6 8.5 2 12 2 12s3.5 8 10 8c1.4 0 2.6-.3 3.8-.8'],
  trash: ['M3 6h18', 'M8 6V4h8v2', 'M6 6l1 14h10l1-14', 'M10 11v5', 'M14 11v5'],
  play: ['M4 5l10 7-10 7z', 'M18 5v14'],
  'play-from': ['M6 5v14', 'M10 5l10 7-10 7z'],
  refresh: ['M20 12a8 8 0 0 1-13.7 5.6', 'M4 12A8 8 0 0 1 17.7 6.4', 'M17 2v5h-5', 'M7 22v-5h5'],
  'message-square': ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
};

const StepIcon = defineComponent({
  name: 'StepIcon',
  props: {
    name: {type: String, required: true},
  },
  setup(props) {
    return () => h(
      'svg',
      {
        class: 'step-action-icon',
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': 2.2,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'aria-hidden': 'true',
      },
      (ICON_PATHS[props.name] ?? []).map((d) => h('path', {d})),
    );
  },
});

const props = defineProps<{
  steps: PipelineStep[];
  selectedStepId: string | null;
  selectedLoopInnerStepId?: string | null;
  selectionRange?: {startIndex: number; endIndex: number; stepIds: string[]} | null;
  trace: PipelineTraceEvent[];
  stepStates?: Record<string, StepStaleState>;
  runPartial?: boolean;
  finalArtifactKey: string | null;
  showCapsuleAdd?: boolean;
  showUndoRedo?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  lastUndoLabel?: string | null;
  lastRedoLabel?: string | null;
  runSnapshots?: Record<string, import('@lorca/core').StepRunSnapshot>;
  artifacts?: Record<string, PipelineArtifact>;
  acceptSuggestionDrop?: boolean;
  disabledModelStepIds?: Set<string>;
  partialRunTargetStepId?: string | null;
}>();

const sourceBadgesByStepId = computed<Record<string, StepDataSourceBadge[]>>(() =>
  Object.fromEntries(props.steps.map((step, index) => [step.id, dataSourceBadges(step, index)])),
);

const emit = defineEmits<{
  select: [stepId: string, extendRange?: boolean];
  'select-loop-inner': [loopStepId: string, innerStepId: string];
  'insert-after': [anchorStepId: string];
  'insert-at': [index: number];
  reorder: [stepId: string, targetIndex: number];
  'drop-suggestion': [suggestionId: string, insertIndex: number];
  'move-up': [stepId: string];
  'move-down': [stepId: string];
  duplicate: [stepId: string];
  'toggle-enabled': [stepId: string];
  delete: [stepId: string];
  append: [type: StepType];
  'run-up-to': [stepId: string];
  'run-from': [stepId: string];
  'run-only-step': [stepId: string];
  'update-step-comment': [stepId: string, comment: string];
  undo: [];
  redo: [];
}>();

const scrollRef = ref<HTMLElement | null>(null);
const draggingStepId = ref<string | null>(null);
const dragOverStepId = ref<string | null>(null);
const dropTargetIndex = ref<number | null>(null);
const activeDragKind = ref<DragKind | null>(null);
const chainDndHover = ref(false);
const expandedOutputStepIds = ref<Set<string>>(new Set());
const expandedCommentStepIds = ref<Set<string>>(new Set());
const commentDrafts = reactive<Record<string, string>>({});

const isDndActive = computed(() =>
  chainDndHover.value
  || draggingStepId.value !== null
  || dropTargetIndex.value !== null
  || dragOverStepId.value !== null,
);

function isStepReorderDragActive(): boolean {
  return draggingStepId.value !== null;
}

function resolveDragKind(): DragKind | null {
  if (isStepReorderDragActive()) return 'step-reorder';
  if (props.acceptSuggestionDrop && isSuggestionDragActive()) return 'suggestion';
  return null;
}

function syncActiveDragKind() {
  activeDragKind.value = resolveDragKind();
}

function draggedStepIdForDrop(event: DragEvent): string | null {
  return draggingStepId.value ?? readDragStepId(event.dataTransfer);
}

function draggedSuggestionIdForDrop(event: DragEvent): string | null {
  return readDragSuggestionId(event.dataTransfer);
}

function clearDndState() {
  draggingStepId.value = null;
  dragOverStepId.value = null;
  dropTargetIndex.value = null;
  activeDragKind.value = null;
  chainDndHover.value = false;
}

function dropHintAtIndex(index: number): string {
  const kind = activeDragKind.value;
  const n = props.steps.length;
  if (kind === 'suggestion') {
    if (n === 0) return 'Insert suggestion as first step';
    if (index >= n) return 'Insert suggestion at end of pipeline';
    const target = props.steps[index];
    return `Insert suggestion before “${target?.label ?? 'step'}”`;
  }
  if (kind === 'step-reorder') {
    if (index >= n) return 'Move step to end of pipeline';
    if (index === 0) return 'Move step to start (position 1)';
    const target = props.steps[index];
    return `Move step before “${target?.label ?? 'step'}” (position ${index + 1})`;
  }
  return 'Drop here';
}

function onChainDragEnter() {
  if (resolveDragKind()) chainDndHover.value = true;
}

function onChainDragLeave(event: DragEvent) {
  const scroll = scrollRef.value;
  const related = event.relatedTarget;
  if (scroll && related instanceof Node && scroll.contains(related)) return;
  chainDndHover.value = false;
}

function isInSelectionRange(stepId: string): boolean {
  const range = props.selectionRange;
  if (!range || range.stepIds.length < 2) return false;
  return range.stepIds.includes(stepId);
}

function onStepClick(stepId: string, event: MouseEvent) {
  emit('select', stepId, event.shiftKey);
}
const stepRefs = new Map<string, HTMLElement>();

function setStepRef(stepId: string, el: HTMLElement | null) {
  if (el) stepRefs.set(stepId, el);
  else stepRefs.delete(stepId);
}

function scrollToStep(stepId: string, behavior: ScrollBehavior = 'smooth') {
  nextTick(() => {
    stepRefs.get(stepId)?.scrollIntoView({block: 'center', behavior});
  });
}

watch(() => props.selectedStepId, (id) => {
  if (id) scrollToStep(id);
});

watch(() => props.steps.length, () => {
  if (props.selectedStepId) scrollToStep(props.selectedStepId, 'auto');
});

onMounted(() => {
  const initialId = props.selectedStepId ?? props.steps[0]?.id;
  if (initialId) scrollToStep(initialId, 'auto');
  document.addEventListener('dragend', clearDndState);
});

onUnmounted(() => {
  document.removeEventListener('dragend', clearDndState);
});

function traceFor(stepId: string): PipelineTraceEvent | undefined {
  return [...props.trace].reverse().find(
    (e) => e.stepId === stepId || e.nodeId === stepId,
  );
}

function traceStatusClass(stepId: string): string {
  const t = traceFor(stepId);
  return t ? `trace-${t.status}` : '';
}

const TYPE_LABELS: Record<StepType, string> = {
  'model-call': 'Model call',
  'presentation': 'Text',
  'capsule-instance': 'Capsule',
  'loop-group': 'Loop',
};

function stepTypeLabel(type: StepType): string {
  return TYPE_LABELS[type] ?? type;
}

function loopExitSummary(step: PipelineStep): string {
  if (step.config.type !== 'loop-group') return '';
  return formatLoopExitSummary(step.config.exitCondition);
}

function historyReadCount(step: PipelineStep): number {
  return getStepHistoryReads(step).length;
}

function dataSourceBadges(step: PipelineStep, index: number): StepDataSourceBadge[] {
  const badges: StepDataSourceBadge[] = [];
  const seenRefs = new Set<string>();

  function addSource(artifactRef: string, kind: StepDataSourceKind, detail: string) {
    const cleaned = artifactRef.trim();
    if (!cleaned || seenRefs.has(cleaned)) return;
    seenRefs.add(cleaned);
    const source = sourceLabelForArtifactRef(cleaned);
    badges.push({
      key: `${kind}:${cleaned}`,
      label: source,
      title: `${detail}: ${cleaned}`,
      kind,
    });
  }

  if (usesPreviousOutputSource(step)) {
    addSource(previousInputArtifactRef(index), 'previous', 'Previous input');
  }

  for (const read of getStepHistoryReads(step)) {
    addSource(read.sourceArtifactRef, 'history', read.required ? `Required history read <${read.tagName}>` : `Optional history read <${read.tagName}>`);
  }

  if (step.config.type === 'presentation') {
    for (const templateRef of artifactRefsInTemplate(step.config.text)) {
      addSource(templateRef, 'template', 'Template reference');
    }
  }

  if (step.config.type === 'capsule-instance') {
    for (const [port, bindingRef] of Object.entries(step.config.inputBindings)) {
      addSource(bindingRef, 'binding', `Capsule input "${port}"`);
    }
  }

  return badges;
}

function usesPreviousOutputSource(step: PipelineStep): boolean {
  if (!['model-call', 'loop-group'].includes(step.config.type)) return false;
  return step.prompt ? step.prompt.previousOutput.enabled : true;
}

function previousInputArtifactRef(index: number): string {
  const previous = previousEnabledStep(index);
  return previous ? `${previous.outputNamespace}.${previous.primaryOutputName}` : 'user_prompt.xml';
}

function previousEnabledStep(index: number): PipelineStep | null {
  for (let i = index - 1; i >= 0; i--) {
    const step = props.steps[i];
    if (step?.enabled) return step;
  }
  return null;
}

function artifactRefsInTemplate(text: string): string[] {
  const refs: string[] = [];
  const re = /\\?\{\{artifact\.([\w.-]+)\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match[0].startsWith('\\')) continue;
    refs.push(match[1]!);
  }
  return refs;
}

function sourceLabelForArtifactRef(artifactRef: string): string {
  if (artifactRef.startsWith('user_prompt.')) return 'Pipeline Input';
  const step = props.steps.find((s) =>
    artifactRef === `${s.outputNamespace}.${s.primaryOutputName}`
    || artifactRef.startsWith(`${s.outputNamespace}.`)
    || (s.config.type === 'capsule-instance' && Object.values(s.config.outputBindings).includes(artifactRef)),
  );
  if (step) return step.label;
  if (artifactRef === PIPELINE_INPUT_STEP_ID) return 'Pipeline Input';
  return artifactRef;
}

function stepHasModelError(step: PipelineStep): boolean {
  if (step.type !== 'model-call' || step.config.type !== 'model-call') return false;
  const modelRef = step.config.modelRef;
  if (modelRef.kind === 'fixed') return !modelRef.endpointId || !modelRef.modelName;
  if (modelRef.kind === 'any-enabled-endpoint') return !modelRef.modelName;
  return false;
}

function jsonValidFailed(step: PipelineStep): boolean {
  return props.artifacts?.[`${step.outputNamespace}.jsonValid`]?.value === false;
}

function jsonValidKnown(step: PipelineStep): boolean {
  return `${step.outputNamespace}.jsonValid` in (props.artifacts ?? {});
}

function jsonValidPassed(step: PipelineStep): boolean {
  return props.artifacts?.[`${step.outputNamespace}.jsonValid`]?.value === true;
}

function runStateFor(stepId: string) {
  return props.stepStates?.[stepId]?.state;
}

function outputPreviewValueFor(step: PipelineStep): unknown | null {
  const key = `${step.outputNamespace}.${step.primaryOutputName}`;
  const artifact = props.artifacts?.[key];
  if (artifact) return artifact.value;

  const preview = props.runSnapshots?.[step.id]?.primaryOutputPreview;
  if (!preview) return null;
  return formatArtifactDisplay(preview, 1200);
}

function isStepOutputCollapsed(stepId: string): boolean {
  return !expandedOutputStepIds.value.has(stepId);
}

function toggleStepOutput(stepId: string) {
  const next = new Set(expandedOutputStepIds.value);
  if (next.has(stepId)) next.delete(stepId);
  else next.add(stepId);
  expandedOutputStepIds.value = next;
}

function isCommentExpanded(stepId: string): boolean {
  return expandedCommentStepIds.value.has(stepId);
}

function toggleComment(step: PipelineStep) {
  const next = new Set(expandedCommentStepIds.value);
  if (next.has(step.id)) {
    next.delete(step.id);
  } else {
    commentDrafts[step.id] = step.description ?? '';
    next.add(step.id);
  }
  expandedCommentStepIds.value = next;
}

function saveComment(stepId: string) {
  emit('update-step-comment', stepId, commentDrafts[stepId] ?? '');
  const next = new Set(expandedCommentStepIds.value);
  next.delete(stepId);
  expandedCommentStepIds.value = next;
}

function cancelComment(step: PipelineStep) {
  commentDrafts[step.id] = step.description ?? '';
  const next = new Set(expandedCommentStepIds.value);
  next.delete(step.id);
  expandedCommentStepIds.value = next;
}

function onStepDragStart(stepId: string, event: DragEvent) {
  const target = event.target as HTMLElement;
  if (target.closest('button, input, textarea, select, a, [contenteditable="true"]')) {
    event.preventDefault();
    return;
  }
  draggingStepId.value = stepId;
  activeDragKind.value = 'step-reorder';
  chainDndHover.value = true;
  event.dataTransfer?.setData(DND_STEP_ID, stepId);
  event.dataTransfer!.effectAllowed = 'move';
  emit('select', stepId);
}

function onStepDragEnd() {
  clearDndState();
}

function onStepDragOver(stepId: string, index: number, event: DragEvent) {
  if (isStepReorderDragActive()) {
    syncActiveDragKind();
    if (draggingStepId.value !== stepId) {
      dragOverStepId.value = stepId;
      dropTargetIndex.value = null;
    }
    event.dataTransfer!.dropEffect = 'move';
    return;
  }
  if (props.acceptSuggestionDrop && isSuggestionDragActive()) {
    syncActiveDragKind();
    dragOverStepId.value = null;
    dropTargetIndex.value = index;
    event.dataTransfer!.dropEffect = 'copy';
  }
}

function onStepDragLeave(stepId: string, event: DragEvent) {
  const stepEl = event.currentTarget as HTMLElement;
  const related = event.relatedTarget;
  if (related instanceof Node && stepEl.contains(related)) return;
  if (dragOverStepId.value === stepId) dragOverStepId.value = null;
}

function onStepDrop(stepId: string, index: number, event: DragEvent) {
  const draggedId = draggedStepIdForDrop(event);
  if (draggedId && draggedId !== stepId) {
    emit('reorder', draggedId, index);
    clearDndState();
    return;
  }
  const suggestionId = draggedSuggestionIdForDrop(event);
  if (props.acceptSuggestionDrop && suggestionId) {
    emit('drop-suggestion', suggestionId, index);
    clearDndState();
  }
}

function onInsertZoneDragOver(index: number, event: DragEvent) {
  if (isStepReorderDragActive()) {
    syncActiveDragKind();
    dragOverStepId.value = null;
    dropTargetIndex.value = index;
    event.dataTransfer!.dropEffect = 'move';
    return;
  }
  if (props.acceptSuggestionDrop && isSuggestionDragActive()) {
    syncActiveDragKind();
    dragOverStepId.value = null;
    dropTargetIndex.value = index;
    event.dataTransfer!.dropEffect = 'copy';
  }
}

function onInsertZoneDragLeave(index: number, event: DragEvent) {
  const zone = event.currentTarget as HTMLElement;
  const related = event.relatedTarget;
  if (related instanceof Node && zone.contains(related)) return;
  if (dropTargetIndex.value === index) dropTargetIndex.value = null;
}

function onInsertZoneDrop(index: number, event: DragEvent) {
  const draggedId = draggedStepIdForDrop(event);
  if (draggedId) {
    emit('reorder', draggedId, index);
    clearDndState();
    return;
  }
  const suggestionId = draggedSuggestionIdForDrop(event);
  if (props.acceptSuggestionDrop && suggestionId) {
    emit('drop-suggestion', suggestionId, index);
    clearDndState();
  }
}

function runStateTitle(stepId: string): string {
  const entry = props.stepStates?.[stepId];
  if (!entry) return '';
  const label = stepRunUiStateLabel(entry.state);
  if (entry.blockReasons?.length) {
    return `${label}: ${entry.blockReasons.join('; ')}`;
  }
  return label;
}
</script>

<style scoped>
.chain-editor {
  --chain-card-max-width: clamp(760px, 72vw, 1040px);
  --chain-card-target-height: clamp(10rem, calc(76vh / var(--chain-visible-step-count)), 50vh);
  --step-action-size: 2.35rem;
  --step-action-icon-size: 1.2rem;

  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #0c0c0c;
  container-type: inline-size;
}

.chain-viewport {
  container-type: size;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  position: relative;
}

@supports (height: 1cqh) {
  .chain-editor {
    --chain-card-target-height: clamp(10rem, calc(76cqh / var(--chain-visible-step-count)), 50cqh);
  }
}

.chain-viewport::before,
.chain-viewport::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  height: 40px;
  pointer-events: none;
  z-index: 1;
}
.chain-viewport::before {
  top: 0;
  background: linear-gradient(to bottom, #0c0c0c 20%, transparent);
}
.chain-viewport::after {
  bottom: 0;
  background: linear-gradient(to top, #0c0c0c 20%, transparent);
}

.chain-scroll {
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 clamp(0.55rem, 2cqw, 1.4rem);
}

.chain-scroll-spacer {
  flex-shrink: 0;
  height: max(5vh, 20px);
  width: 100%;
}

.chain-step {
  width: 100%;
  max-width: var(--chain-card-max-width);
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
}

.step-connector { color: #444; font-size: 0.85rem; margin: 1px 0; flex-shrink: 0; }

.step-card {
  width: 100%;
  min-width: 0;
  min-height: var(--chain-card-target-height);
  max-height: 50cqh;
  display: flex;
  align-items: stretch;
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  border-radius: 8px;
  padding: 0;
  overflow: hidden;
  cursor: default;
  transition: border-color 0.15s, background 0.15s, box-shadow 0.15s, opacity 0.15s;
}
.step-card:active { cursor: default; }
.chain-step.dragging .step-card { cursor: default; }
.chain-step.output-expanded .step-card {
  height: auto;
  max-height: 50cqh;
}
.step-card-content {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: clamp(0.45rem, 1.3cqh, 0.9rem);
  padding: clamp(0.8rem, 2.2cqh, 1.6rem) clamp(0.7rem, 2cqw, 1.35rem) clamp(0.75rem, 1.8cqh, 1.35rem) clamp(0.6rem, 1.4cqw, 1rem);
}
.chain-step.output-expanded .step-card-content { overflow: hidden; }
.chain-step:not(.selected) .step-card { opacity: 0.82; transform: scale(0.98); }
.chain-step:not(.selected):hover .step-card { opacity: 0.95; }
.chain-editor.dnd-active .chain-step:not(.selected):not(.dragging) .step-card { opacity: 0.88; }
.chain-step.in-selection-range:not(.selected) .step-card {
  border-color: #4a3a6a;
  box-shadow: 0 0 0 1px #4a3a6a44;
}
.chain-step.selected .step-card {
  opacity: 1;
  transform: scale(1);
  border-color: #2a5070;
  background: #111e2a;
  box-shadow: 0 0 0 1px #2a5070, 0 6px 18px rgba(0,0,0,0.3);
}
.chain-step.disabled .step-card { opacity: 0.45; border-style: dashed; }

.trace-completed .step-card { border-left: 3px solid #3a9d6e; }
.trace-failed .step-card { border-left: 3px solid #c0392b; }
.trace-running .step-card, .trace-started .step-card { border-left: 3px solid #e8a020; }
.trace-skipped .step-card { opacity: 0.4; }
.trace-cancelled .step-card { border-left: 3px solid #666; }

.chain-step.partial-run-target {
  border-bottom: 2px solid var(--color-run-accent, #4a9eff);
}
.chain-step.partial-run-target .step-card::after {
  content: '▲ partial run boundary';
  font-size: 0.65rem;
  color: var(--color-run-accent, #4a9eff);
  display: block;
  text-align: right;
  padding: 0.25rem 0.5rem;
  opacity: 0.8;
}

.step-card-header {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  flex-wrap: wrap;
  min-width: 0;
}
.step-drag-handle {
  flex-shrink: 0;
  align-self: stretch;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  border-right: 1px solid #2a2a2a;
  border-radius: 8px 0 0 8px;
  background: #141414;
  color: #555;
  user-select: none;
}
.step-drag-grip {
  font-size: 0.9rem;
  line-height: 1;
  letter-spacing: -0.12em;
}
.chain-step:hover .step-drag-handle { color: #777; background: #1c1c1c; }
.chain-step.selected .step-drag-handle {
  background: #0e1822;
  border-right-color: #2a5070;
  color: #6a9fc8;
}
.chain-step.selected:hover .step-drag-handle { background: #152535; color: #8ec8e8; }
.step-card-content :is(button, input, textarea, select) { cursor: pointer; }
.chain-step.dragging .step-card { opacity: 0.45; }
/* Full step-card outline when reordering onto an existing step */
.chain-step.drop-target-step .step-card {
  outline: 2px dashed #5a9fd4;
  outline-offset: 3px;
  border-color: #5a9fd4;
  background: #152535;
  box-shadow:
    0 0 0 1px rgba(90, 159, 212, 0.35),
    0 0 18px 4px rgba(90, 159, 212, 0.45),
    0 0 36px 10px rgba(90, 159, 212, 0.2),
    inset 0 0 28px rgba(90, 159, 212, 0.08);
}
.step-drop-banner {
  margin-top: 0.35rem;
  padding: 0.3rem 0.5rem;
  font-size: 0.68rem;
  font-weight: 600;
  color: #a8dff5;
  text-align: center;
  background: #1a3048;
  border: 1px dashed #5a9fd4;
  border-radius: 4px;
}
.chain-editor.dnd-active .insert-zone {
  opacity: 1 !important;
  padding: 6px 0;
}
/* Card-sized drop placeholders (full element footprint) */
.drop-slot-card {
  width: 100%;
  max-width: var(--chain-card-max-width);
  box-sizing: border-box;
  border-radius: 8px;
  pointer-events: none;
}
.drop-slot-card-inner {
  min-height: var(--chain-card-target-height);
  max-height: 50cqh;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  box-sizing: border-box;
}
.drop-slot-card-ghost .drop-slot-card-inner {
  border: 2px dashed #3a5060;
  background: #0e1218;
  opacity: 0.65;
  box-shadow:
    0 0 10px 2px rgba(90, 159, 212, 0.12),
    0 0 22px 6px rgba(90, 159, 212, 0.06),
    inset 0 0 16px rgba(90, 159, 212, 0.04);
}
.drop-slot-card-active .drop-slot-card-inner {
  border: 2px dashed #5a9fd4;
  background: #141e28;
  outline: 2px solid rgba(90, 159, 212, 0.35);
  outline-offset: 2px;
  opacity: 1;
  box-shadow:
    0 0 14px 3px rgba(90, 159, 212, 0.5),
    0 0 32px 10px rgba(90, 159, 212, 0.28),
    inset 0 0 24px rgba(90, 159, 212, 0.1);
  animation: drop-zone-glow-pulse 1.6s ease-in-out infinite;
}
.chain-editor.dnd-kind-suggestion .drop-slot-card-ghost .drop-slot-card-inner {
  border-color: #3a5040;
  box-shadow:
    0 0 10px 2px rgba(109, 184, 109, 0.12),
    0 0 22px 6px rgba(109, 184, 109, 0.06),
    inset 0 0 16px rgba(109, 184, 109, 0.04);
}
.chain-editor.dnd-kind-suggestion .drop-slot-card-active .drop-slot-card-inner {
  border-color: #5a9d6e;
  background: #141f18;
  outline-color: rgba(109, 184, 109, 0.35);
  box-shadow:
    0 0 14px 3px rgba(109, 184, 109, 0.45),
    0 0 32px 10px rgba(109, 184, 109, 0.22),
    inset 0 0 24px rgba(109, 184, 109, 0.08);
}
.chain-editor.dnd-kind-suggestion .drop-slot-card-active .drop-slot-label { color: #8dda8d; }
.chain-editor.dnd-kind-suggestion .chain-step.drop-target-step .step-card {
  outline-color: #5a9d6e;
  border-color: #5a9d6e;
  background: #152518;
  box-shadow:
    0 0 0 1px rgba(109, 184, 109, 0.35),
    0 0 18px 4px rgba(109, 184, 109, 0.4),
    0 0 36px 10px rgba(109, 184, 109, 0.18),
    inset 0 0 28px rgba(109, 184, 109, 0.07);
}
@keyframes drop-zone-glow-pulse-blue {
  0%, 100% {
    box-shadow:
      0 0 12px 2px rgba(90, 159, 212, 0.4),
      0 0 28px 8px rgba(90, 159, 212, 0.22),
      inset 0 0 20px rgba(90, 159, 212, 0.08);
  }
  50% {
    box-shadow:
      0 0 20px 5px rgba(90, 159, 212, 0.55),
      0 0 40px 14px rgba(90, 159, 212, 0.32),
      inset 0 0 32px rgba(90, 159, 212, 0.12);
  }
}
@keyframes drop-zone-glow-pulse-green {
  0%, 100% {
    box-shadow:
      0 0 12px 2px rgba(109, 184, 109, 0.38),
      0 0 28px 8px rgba(109, 184, 109, 0.2),
      inset 0 0 20px rgba(109, 184, 109, 0.07);
  }
  50% {
    box-shadow:
      0 0 20px 5px rgba(109, 184, 109, 0.52),
      0 0 40px 14px rgba(109, 184, 109, 0.28),
      inset 0 0 32px rgba(109, 184, 109, 0.11);
  }
}
.chain-editor.dnd-kind-step-reorder .drop-slot-card-active .drop-slot-card-inner,
.chain-editor.dnd-kind-step-reorder .chain-step.drop-target-step .step-card {
  animation: drop-zone-glow-pulse-blue 1.8s ease-in-out infinite;
}
.chain-editor.dnd-kind-suggestion .drop-slot-card-active .drop-slot-card-inner {
  animation: drop-zone-glow-pulse-green 1.8s ease-in-out infinite;
}
.drop-slot-label {
  padding: 0.5rem 0.75rem;
  font-size: 0.68rem;
  font-weight: 600;
  color: #7ec8e3;
  text-align: center;
  line-height: 1.35;
}
.insert-zone.drop-target-active {
  padding: 8px 0;
}
.chain-empty.drop-target-active {
  padding: 1rem;
  border-radius: 10px;
  box-shadow:
    0 0 20px 6px rgba(90, 159, 212, 0.2),
    inset 0 0 40px rgba(90, 159, 212, 0.05);
}
.chain-editor.dnd-kind-suggestion .chain-empty.drop-target-active {
  box-shadow:
    0 0 20px 6px rgba(109, 184, 109, 0.18),
    inset 0 0 40px rgba(109, 184, 109, 0.05);
}
.chain-empty.drop-target-active .drop-slot-card-active .drop-slot-card-inner {
  min-height: 6rem;
}
.chain-empty-drop-slot { width: 100%; margin-bottom: 0.75rem; }
.chain-empty-hint { font-size: 0.72rem; color: #555; margin: 0; }
.step-type-badge {
  font-size: clamp(0.7rem, 1.5cqh, 0.95rem); padding: 2px 7px; border-radius: 3px;
  background: #222; color: #666; flex-shrink: 0; text-transform: uppercase; letter-spacing: 0.04em;
}
.badge-model-call { background: #1e2d3d; color: #5a9fd4; }
.badge-presentation { background: #1e2a1e; color: #5a9d5a; }
.badge-capsule-instance { background: #2a1e3d; color: #9d6db8; }

.step-title {
  flex: 1 1 10rem; min-width: 0; font-size: clamp(1.05rem, 2.3cqh, 1.45rem); font-weight: 650;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.step-title.disabled { text-decoration: line-through; color: #555; }

.step-actions {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(var(--step-action-size), var(--step-action-size)));
  gap: 0.35rem;
  justify-content: start;
  width: 100%;
  min-width: 0;
  opacity: 0.55;
  transition: opacity 0.1s;
}
.step-card:hover .step-actions, .chain-step.selected .step-actions { opacity: 1; }

.step-meta { display: flex; gap: 0.55rem 1.25rem; font-size: clamp(0.86rem, 1.7cqh, 1.05rem); color: #555; flex-wrap: wrap; align-items: center; }
.step-meta-item { display: inline-flex; align-items: center; gap: 0.28rem; min-width: 0; max-width: 100%; }
.step-meta-label { font-size: clamp(0.6rem, 1.15cqh, 0.75rem); font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #3a3a3a; flex-shrink: 0; }
.step-model { color: #5a9fd4; }
.step-model,
.step-namespace {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.step-namespace { color: #666; font-family: monospace; }
.step-disabled-badge { background: #2a2a1a; color: #888; border-radius: 2px; padding: 0 4px; }
.step-history-badge { background: #1a2a3a; color: #6a9fc8; border-radius: 2px; padding: 0 4px; font-family: monospace; }
.step-badge { font-size: clamp(0.74rem, 1.45cqh, 1rem); padding: 1px 6px; border-radius: 2px; }
.step-badge-warn { background: #2a1a0a; color: #e8a020; border: 1px solid #5a3810; }
.step-badge-model-off { background: #2a2010; color: #c8a030; border: 1px solid #4a3a10; }
.step-badge-json { background: #1a2a1a; color: #60c060; border: 1px solid #2a5a2a; font-size: clamp(0.64rem, 1.25cqh, 0.85rem); font-weight: 700; letter-spacing: 0.05em; }
.step-badge-json-fail { background: #2a1a1a; color: #e06060; border-color: #5a2a2a; }
.chain-step.model-disabled .step-card { border-left: 3px solid #7a6020; }

.step-run-badge {
  border-radius: 2px; padding: 1px 6px; font-size: clamp(0.74rem, 1.45cqh, 1rem); text-transform: lowercase;
}
.run-not-run { background: #1a1a1a; color: #555; }
.run-current { background: #1a2e1a; color: #5a9d5a; }
.run-stale { background: #2e2a1a; color: #c8a050; }
.run-failed-current { background: #2e1a1a; color: #c07070; }
.run-failed-stale { background: #2e1a1a; color: #a05050; border: 1px dashed #804040; }
.run-disabled { background: #1a1a1a; color: #444; }
.run-skipped-partial { background: #1a1a2a; color: #606080; }
.run-blocked { background: #2e1a1a; color: #e07070; border: 1px solid #5a3030; }

.step-source-badges {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.45rem;
  min-width: 0;
}
.step-source-label {
  font-size: clamp(0.68rem, 1.35cqh, 0.9rem);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #555;
}
.step-source-badge {
  max-width: min(100%, 18rem);
  padding: 0.18rem 0.5rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border: 1px solid #2a3d4a;
  border-radius: 999px;
  background: #121a20;
  color: #8ab8cf;
  font-size: clamp(0.82rem, 1.65cqh, 1.05rem);
  font-weight: 600;
}
.source-previous { border-color: #2a5060; border-style: dashed; background: #0f1e26; color: #6dbcd8; }
.source-history { border-color: #3a3752; background: #181725; color: #aaa0dc; }
.source-template { border-color: #3a4a35; background: #151e14; color: #9bcf8a; }
.source-binding { border-color: #4a3d2a; background: #211a10; color: #d2b16f; }
.source-direct { border-color: #4a332f; background: #211514; color: #d58a7a; }
.prev-output-marker { opacity: 0.65; margin-right: 0.25em; font-size: 0.85em; }

.step-trace { display: flex; gap: 0.55rem; font-size: clamp(0.84rem, 1.7cqh, 1.1rem); }
.status-completed { color: #3a9d6e; }
.status-failed { color: #c0392b; }
.status-started, .status-running { color: #e8a020; }
.status-skipped, .status-cancelled { color: #555; }
.step-duration { color: #444; }

.step-output-preview-wrap {
  max-width: 100%;
  min-width: 0;
  background: #0d0d0d;
  border-radius: 5px;
  border: 1px solid #242424;
  overflow: hidden;
}
.chain-step.output-expanded .step-output-preview-wrap {
  min-height: 0;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
}
.step-output-preview-header {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0.55rem;
  background: transparent;
  border-bottom: 1px solid #202020;
  border-left: 0;
  border-right: 0;
  border-top: 0;
  cursor: pointer;
  text-align: left;
}
.step-output-preview-header:hover { background: #121212; }
.step-output-toggle-indicator {
  width: 1ch;
  color: #888;
  font-family: monospace;
  font-size: clamp(0.86rem, 1.7cqh, 1.1rem);
  font-weight: 700;
}
.step-output-preview-label {
  flex: 1;
  color: #666;
  font-size: clamp(0.68rem, 1.35cqh, 0.9rem);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.step-output-preview-header:hover .step-output-preview-label,
.step-output-preview-header:hover .step-output-toggle-indicator { color: #ccc; }
.step-output-preview {
  flex: 1 1 auto;
  min-height: 0;
  margin: 0;
  overflow: auto;
  overscroll-behavior: contain;
}
.step-output-preview :deep(.jv-raw),
.step-output-preview :deep(.jv-pretty) {
  border: 0;
  border-radius: 0;
  background: transparent;
  padding: 0.65rem 0.75rem;
  font-size: clamp(0.9rem, 1.8cqh, 1.15rem);
  color: #888;
  max-height: none;
}
.btn-run-up-to {
  width: var(--step-action-size);
  height: var(--step-action-size);
  background: #1a2e1a; border: 1px solid #2a4d2a; color: #6db86d;
  border-radius: 5px; cursor: pointer;
}
.btn-run-up-to:hover { background: #1e381e; color: #8dda8d; }
.btn-run-from {
  width: var(--step-action-size);
  height: var(--step-action-size);
  background: #2e1e0a; border: 1px solid #4d3810; color: #c89030;
  border-radius: 5px; cursor: pointer;
}
.btn-run-from:hover { background: #3a2810; color: #e8b050; }
.btn-run-only-step {
  width: var(--step-action-size);
  height: var(--step-action-size);
  background: #1a1a2e; border: 1px solid #2a2a4d; color: #6d6db8;
  border-radius: 5px; cursor: pointer;
}
.btn-run-only-step:hover { background: #1e1e38; color: #8d8dda; }

/* Insert zone between steps */
.insert-zone {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 0;
  width: 100%;
  max-width: var(--chain-card-max-width);
  opacity: 0;
  transition: opacity 0.15s;
}
.insert-zone-top { margin-bottom: 2px; }
.chain-scroll:hover .insert-zone { opacity: 1; }
.insert-zone:hover { opacity: 1 !important; }

.btn-insert {
  width: 20px; height: 20px; border-radius: 50%;
  background: #1a3a1a; border: 1px solid #2a5a2a; color: #5a9d5a;
  cursor: pointer; font-size: 0.9rem; line-height: 1;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.1s, transform 0.1s;
}
.btn-insert:hover { background: #1e4a1e; color: #8dda8d; transform: scale(1.2); }

.chain-empty {
  display: flex; flex-direction: column; align-items: center; gap: 0.75rem;
  padding: 2rem 0; color: #555; font-size: 0.82rem;
}
.chain-empty p { margin: 0; }

.chain-output-ref {
  display: flex; gap: 0.5rem; align-items: center;
  padding: 0.35rem 0.65rem; background: #111; border: 1px dashed #333;
  border-radius: 5px; width: 100%; max-width: var(--chain-card-max-width); flex-shrink: 0;
  opacity: 0.75;
}
.output-label { font-size: 0.65rem; color: #555; }
.output-key { font-size: 0.72rem; color: #7ec8e3; font-family: monospace; }


.btn { background: #1a1a1a; border: 1px solid #2a2a2a; color: #888; border-radius: 4px; cursor: pointer; }
.btn-sm { padding: 3px 9px; font-size: 0.72rem; }
.btn:hover:not(:disabled) { background: #222; color: #ccc; border-color: #3a3a3a; }
.btn:disabled { opacity: 0.35; cursor: default; }
.btn-accent { background: #1e3d52; border-color: #2a5070; color: #7ec8e3; }
.btn-accent:hover:not(:disabled) { background: #254a62; color: #a8dff5; }
.btn-capsule { border-color: #2a3d52; color: #5a9fd4; }
.btn-capsule:hover:not(:disabled) { background: #1a2a3a; }
.btn-primary { background: #1e3d52; border-color: #2a5070; color: #7ec8e3; }
.btn-primary:hover:not(:disabled) { background: #254a62; color: #a8dff5; }
.btn-ghost { background: none; border-color: transparent; color: #555; }
.btn-ghost:hover:not(:disabled) { background: #1a1a1a; color: #888; border-color: #333; }

.icon-btn {
  width: var(--step-action-size);
  height: var(--step-action-size);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  background: #151515;
  border: 1px solid #2a2a2a;
  border-radius: 5px;
  color: #777;
  cursor: pointer;
}
.icon-btn:hover:not(:disabled) { background: #202020; border-color: #3a3a3a; color: #ccc; }
.icon-btn:disabled { opacity: 0.2; cursor: default; }
.icon-btn.danger:hover:not(:disabled) { border-color: #5a3030; color: #e07070; background: #241616; }
.step-action-icon {
  width: var(--step-action-icon-size);
  height: var(--step-action-icon-size);
  flex-shrink: 0;
}

.icon-btn.comment-has-content { color: #b8960a; border-color: #3a3010; }
.icon-btn.comment-has-content:hover:not(:disabled) { background: #201800; border-color: #5a4820; color: #e8c040; }

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
  background: #0a0900;
  border: none;
  border-top: 1px solid #2a2510;
  color: #c8a840;
  font-size: clamp(0.9rem, 1.8cqh, 1.15rem);
  font-family: inherit;
  line-height: 1.5;
  padding: 0.55rem 0.65rem;
  resize: vertical;
  outline: none;
  cursor: text;
}
.step-card-content .step-comment-textarea { cursor: text; }
.step-comment-textarea:focus { background: #0c0a00; border-top-color: #4a3d18; }
.step-comment-textarea::placeholder { color: #4a4010; }
.step-comment-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.45rem;
  padding: 0.45rem 0.55rem 0.5rem;
  border-top: 1px solid #2a2510;
  background: #0b0a03;
}

/* Loop group inline visualization */
.loop-group-body {
  margin: 0.45rem 0 0.2rem;
  padding: 0.55rem 0.65rem;
  background: #101418;
  border: 1px solid #2a3545;
  border-left: 3px solid #5a7aa8;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.loop-group-banner {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.35rem;
  font-size: clamp(0.72rem, 1.4cqh, 0.88rem);
  color: #8ab0d8;
}
.loop-group-icon { font-size: 1rem; color: #7ec8e3; }
.loop-group-dot { color: #444; }
.loop-group-exit { color: #9ab8d0; font-family: monospace; font-size: 0.85em; }
.loop-inner-empty { font-size: 0.78rem; color: #555; margin: 0; }
.loop-inner-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.loop-inner-item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.5rem;
  background: #0d1014;
  border: 1px solid #222830;
  border-radius: 4px;
  cursor: pointer;
  font-size: clamp(0.75rem, 1.45cqh, 0.92rem);
}
.loop-inner-item:hover { border-color: #3a5068; background: #121820; }
.loop-inner-selected { border-color: #4a7090; background: #152030; }
.loop-inner-index { color: #555; min-width: 1.1rem; font-family: monospace; }
.loop-inner-type {
  font-size: 0.62rem;
  padding: 1px 5px;
  background: #1a2430;
  color: #7ec8e3;
  border-radius: 2px;
  flex-shrink: 0;
}
.loop-inner-label { flex: 1; color: #ccc; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.loop-inner-exit-badge {
  font-size: 0.62rem;
  padding: 1px 5px;
  background: #1a2a1a;
  color: #8ab88a;
  border-radius: 2px;
  flex-shrink: 0;
}
.loop-prev-hint {
  margin: 0;
  font-size: 0.68rem;
  color: #555;
}
.loop-prev-hint code { color: #6a8ab0; font-size: 0.65rem; }

@container (max-width: 620px) {
  .chain-scroll {
    padding-inline: 0.65rem;
  }

  .step-card,
  .chain-step.output-expanded .step-card {
    min-height: auto;
    max-height: none;
  }

  .step-card-content {
    --step-action-size: 2rem;
    --step-action-icon-size: 1.05rem;

    gap: 0.55rem;
    padding: 0.8rem 0.7rem 0.85rem 0.6rem;
  }

  .step-drag-handle {
    width: 1.45rem;
  }

  .step-card-header {
    gap: 0.35rem;
  }

  .step-title {
    flex-basis: 12rem;
    font-size: 1.05rem;
  }

  .step-type-badge,
  .step-badge,
  .step-run-badge {
    font-size: 0.68rem;
  }

  .step-actions {
    gap: 0.25rem;
  }

  .step-meta,
  .step-trace {
    gap: 0.35rem 0.75rem;
    font-size: 0.82rem;
  }

  .step-source-badge {
    max-width: 100%;
    font-size: 0.78rem;
  }

}

@container (max-width: 430px) {
  .step-card-content {
    --step-action-size: 1.9rem;
    --step-action-icon-size: 1rem;

    padding: 0.7rem 0.55rem 0.75rem;
  }

  .step-title {
    flex-basis: 100%;
  }

  .step-meta,
  .step-trace {
    flex-direction: column;
    align-items: flex-start;
  }

  .chain-output-ref {
    align-items: flex-start;
    flex-direction: column;
    gap: 0.2rem;
  }

  .output-key {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>
