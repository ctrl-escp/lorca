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
        @dragenter="onChainDragEnter()"
        @dragleave="onChainDragLeave($event, scrollRef)"
      >
        <div class="chain-scroll-spacer" aria-hidden="true" />

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
          <div :ref="(el) => setStepRef(step.id, el as HTMLElement | null)">
            <ChainStepCard
              :step="step"
              :index="i"
              :steps-length="steps.length"
              :selected="selectedStepId === step.id"
              :in-selection-range="isInSelectionRange(step.id)"
              :model-disabled="props.disabledModelStepIds?.has(step.id) ?? false"
              :drop-target="dragOverStepId === step.id && activeDragKind === 'step-reorder'"
              :dragging="draggingStepId === step.id"
              :output-expanded="outputPreviewValueFor(step, artifacts, runSnapshots) !== null && !outputPreview.isStepOutputCollapsed(step.id)"
              :partial-run-target="step.id === props.partialRunTargetStepId"
              :trace-status-class="traceStatusClassForStep(step.id, executionChipByStepId, traceForStep(step.id))"
              :execution-chip="executionChipByStepId[step.id] ?? null"
              :source-badges="sourceBadgesByStepId[step.id] ?? []"
              :inner-execution-chips-by-key="innerExecutionChipByKey"
              :selected-step-id="selectedStepId"
              :selected-loop-inner-step-id="selectedLoopInnerStepId ?? null"
              :selected-inline-capsule-inner-step-id="selectedInlineCapsuleInnerStepId ?? null"
              :drag-over-step-id="dragOverStepId"
              :active-drag-kind="activeDragKind"
              :drop-hint="dropHintAtIndex(i)"
              :trace="traceForStep(step.id)"
              :step-states="stepStates"
              :artifacts="artifacts"
              :run-snapshots="runSnapshots"
              :comment-expanded="comments.isCommentExpanded(step.id)"
              :comment-draft="comments.commentDrafts[step.id] ?? ''"
              :output-collapsed="outputPreview.isStepOutputCollapsed(step.id)"
              :output-preview="outputPreviewValueFor(step, artifacts, runSnapshots)"
              @click="onStepClick(step.id, $event)"
              @dragover="onStepDragOver(step.id, i, $event)"
              @dragleave="onStepDragLeave(step.id, $event)"
              @drop="onStepDrop(step.id, i, $event)"
              @dragstart="onStepDragStart(step.id, $event)"
              @dragend="onStepDragEnd()"
              @contextmenu="openStepContextMenu(step, $event)"
              @run-up-to="$emit('run-up-to', $event)"
              @run-from="$emit('run-from', $event)"
              @run-only-step="$emit('run-only-step', $event)"
              @move-up="$emit('move-up', $event)"
              @move-down="$emit('move-down', $event)"
              @duplicate="$emit('duplicate', $event)"
              @toggle-enabled="$emit('toggle-enabled', $event)"
              @delete="$emit('delete', $event)"
              @spread-capsule="$emit('spread-capsule', $event)"
              @select-loop-inner="(loopId, innerId) => $emit('select-loop-inner', loopId, innerId)"
              @select-inline-capsule-inner="(capsuleId, innerId) => $emit('select-inline-capsule-inner', capsuleId, innerId)"
              @collapse-inline-capsule="$emit('collapse-inline-capsule', $event)"
              @lock-inline-capsule="$emit('lock-inline-capsule', $event)"
              @detach-capsule="$emit('detach-capsule', $event)"
              @toggle-comment="comments.toggleComment(step)"
              @update:comment-draft="comments.commentDrafts[step.id] = $event"
              @save-comment="comments.saveComment(step.id)"
              @cancel-comment="comments.cancelComment(step)"
              @toggle-output="outputPreview.toggleStepOutput(step.id)"
            />
          </div>

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

        <div v-if="steps.length > 0" class="chain-output-ref">
          <span class="output-label hdr-output">{{ runPartial ? 'Partial output' : 'Output' }}</span>
          <span class="output-key">{{ finalArtifactKey ?? '(none)' }}</span>
        </div>

        <div class="chain-scroll-spacer" aria-hidden="true" />
      </div>
    </div>

    <ContextMenu
      :open="stepContextMenu !== null"
      :x="stepContextMenu?.x ?? 0"
      :y="stepContextMenu?.y ?? 0"
      :items="stepContextMenuItems"
      @select="selectStepContextMenuAction"
      @close="closeStepContextMenu"
    />
  </div>
</template>

<script setup lang="ts">
import {ref, computed, watch, nextTick, onMounted, onUnmounted, toRef} from 'vue';
import {type PipelineArtifact, type PipelineError, type PipelineStep, type PipelineTraceEvent, type StepType} from '@lorca/core';
import type {StepStaleState} from '@lorca/pipeline';
import {dataSourceBadgesByStepId} from '../../utils/chainStepDataSources.js';
import {
  buildExecutionChipsByStepId,
  buildInnerExecutionChipsByKey,
  outputPreviewValueFor,
  resolveTraceForStep,
  traceStatusClassForStep,
} from '../../utils/chainStepDisplay.js';
import {useChainEditorDnd} from '../../composables/useChainEditorDnd.js';
import {useChainStepComments, useChainStepOutputPreview} from '../../composables/useChainStepComments.js';
import {useChainStepContextMenu} from '../../composables/useChainStepContextMenu.js';
import ContextMenu from '../shared/ContextMenu.vue';
import DropSlotIndicator from './DropSlotIndicator.vue';
import ChainStepCard from './ChainStepCard.vue';

const props = defineProps<{
  steps: PipelineStep[];
  selectedStepId: string | null;
  selectedLoopInnerStepId?: string | null;
  selectedInlineCapsuleInnerStepId?: string | null;
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
  runStatus?: 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';
  runError?: PipelineError | null;
  acceptSuggestionDrop?: boolean;
  disabledModelStepIds?: Set<string>;
  partialRunTargetStepId?: string | null;
}>();

const emit = defineEmits<{
  select: [stepId: string, extendRange?: boolean];
  'select-loop-inner': [loopStepId: string, innerStepId: string];
  'select-inline-capsule-inner': [capsuleStepId: string, innerStepId: string];
  'spread-capsule': [stepId: string];
  'collapse-inline-capsule': [stepId: string];
  'lock-inline-capsule': [stepId: string];
  'detach-capsule': [stepId: string];
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
const stepContextMenu = ref<{stepId: string; x: number; y: number} | null>(null);

const sourceBadgesByStepId = computed(() => dataSourceBadgesByStepId(props.steps));

const executionChipByStepId = computed(() =>
  buildExecutionChipsByStepId(props.steps, props.trace, {
    finalArtifactKey: props.finalArtifactKey,
    ...(props.runSnapshots !== undefined ? {runSnapshots: props.runSnapshots} : {}),
    ...(props.runStatus !== undefined ? {runStatus: props.runStatus} : {}),
    ...(props.runError !== undefined ? {runError: props.runError} : {}),
  }),
);

const innerExecutionChipByKey = computed(() =>
  buildInnerExecutionChipsByKey(props.steps, props.trace, props.runSnapshots, props.runStatus),
);

const comments = useChainStepComments((stepId, comment) => emit('update-step-comment', stepId, comment));
const outputPreview = useChainStepOutputPreview();

const dnd = useChainEditorDnd({
  steps: toRef(props, 'steps'),
  acceptSuggestionDrop: toRef(props, 'acceptSuggestionDrop'),
  onReorder: (stepId, targetIndex) => emit('reorder', stepId, targetIndex),
  onDropSuggestion: (suggestionId, insertIndex) => emit('drop-suggestion', suggestionId, insertIndex),
  onSelectStep: (stepId) => emit('select', stepId),
});

const {
  draggingStepId,
  dragOverStepId,
  dropTargetIndex,
  activeDragKind,
  isDndActive,
  clearDndState,
  dropHintAtIndex,
  onChainDragEnter,
  onChainDragLeave,
  onStepDragStart,
  onStepDragEnd,
  onStepDragOver,
  onStepDragLeave,
  onStepDrop,
  onInsertZoneDragOver,
  onInsertZoneDragLeave,
  onInsertZoneDrop,
} = dnd;

const {
  stepContextMenuItems,
  openStepContextMenu,
  closeStepContextMenu,
  selectStepContextMenuAction,
} = useChainStepContextMenu({
  steps: toRef(props, 'steps'),
  menu: stepContextMenu,
  emit: (event, ...args) => { (emit as (e: string, ...a: unknown[]) => void)(event, ...args); },
  onComment: comments.toggleComment,
});

function traceForStep(stepId: string) {
  return resolveTraceForStep(stepId, props.steps, props.trace, {
    finalArtifactKey: props.finalArtifactKey,
    ...(props.runStatus !== undefined ? {runStatus: props.runStatus} : {}),
    ...(props.runError !== undefined ? {runError: props.runError} : {}),
    ...(props.runSnapshots !== undefined ? {runSnapshots: props.runSnapshots} : {}),
  });
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
</script>

<style scoped>
.chain-editor {
  --chain-card-max-width: clamp(760px, 72vw, 1040px);
  --chain-card-target-height: clamp(10rem, calc(76vh / var(--chain-visible-step-count)), 50vh);

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

.chain-editor.dnd-active .insert-zone {
  opacity: 1 !important;
  padding: 6px 0;
}

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
.chain-editor.dnd-kind-suggestion :deep(.chain-step.drop-target-step .step-card) {
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
.chain-editor.dnd-kind-step-reorder :deep(.chain-step.drop-target-step .step-card) {
  animation: drop-zone-glow-pulse-blue 1.8s ease-in-out infinite;
}
.chain-editor.dnd-kind-suggestion .drop-slot-card-active .drop-slot-card-inner {
  animation: drop-zone-glow-pulse-green 1.8s ease-in-out infinite;
}
.drop-slot-label {
  padding: 0.5rem 0.75rem;
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--accent);
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
.chain-empty-hint { font-size: 0.72rem; color: var(--text-secondary); margin: 0; }

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
  padding: 2rem 0; color: var(--text-secondary); font-size: 0.82rem;
}
.chain-empty p { margin: 0; }

.chain-output-ref {
  display: flex; gap: 0.5rem; align-items: center;
  padding: 0.35rem 0.65rem; background: #111; border: 1px dashed #333;
  border-radius: 5px; width: 100%; max-width: var(--chain-card-max-width); flex-shrink: 0;
  opacity: 0.75;
}
.output-label { font-size: 0.65rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
.output-key { font-size: 0.72rem; color: var(--accent); font-family: monospace; }

.btn { background: #1a1a1a; border: 1px solid #2a2a2a; color: var(--text-label); border-radius: 4px; cursor: pointer; }
.btn-sm { padding: 3px 9px; font-size: 0.72rem; }
.btn:hover:not(:disabled) { background: #222; color: #ccc; border-color: #3a3a3a; }
.btn-accent { background: var(--accent-bg); border-color: var(--accent-border); color: var(--accent); }
.btn-accent:hover:not(:disabled) { background: var(--accent-bg-hover); color: #a8dff5; }

.chain-editor.dnd-active :deep(.chain-step:not(.selected):not(.dragging) .step-card) { opacity: 0.88; }

@container (max-width: 620px) {
  .chain-scroll {
    padding-inline: 0.65rem;
  }
}

@container (max-width: 430px) {
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
