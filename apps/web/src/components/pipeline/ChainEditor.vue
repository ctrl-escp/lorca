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
              'drop-target-step': dragOverStepId === step.id && activeDragKind === 'step-reorder',
              dragging: draggingStepId === step.id,
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
              draggable="true"
              title="Drag to reorder"
              @dragstart="onStepDragStart(step.id, $event)"
              @dragend="onStepDragEnd"
            >
              <div class="step-drag-handle" aria-hidden="true">
                <span class="step-drag-grip">⠿</span>
              </div>
              <div class="step-card-content">
              <div class="step-card-header">
                <span class="step-type-badge" :class="`badge-${step.type}`">{{ stepTypeLabel(step.type) }}</span>
                <span class="step-title" :class="{disabled: !step.enabled}">{{ step.label }}</span>
                <span v-if="stepHasModelError(step)" class="step-badge step-badge-warn" title="No model selected">no model</span>
                <div class="step-actions">
                  <button class="icon-btn" :disabled="i === 0" @click.stop="$emit('move-up', step.id)" title="Move up">↑</button>
                  <button class="icon-btn" :disabled="i === steps.length - 1" @click.stop="$emit('move-down', step.id)" title="Move down">↓</button>
                  <button class="icon-btn" @click.stop="$emit('duplicate', step.id)" title="Duplicate step">⊕</button>
                  <button class="icon-btn" @click.stop="$emit('toggle-enabled', step.id)" :title="step.enabled ? 'Disable step' : 'Enable step'">{{ step.enabled ? '◉' : '○' }}</button>
                  <button class="icon-btn danger" @click.stop="$emit('delete', step.id)" title="Delete step">×</button>
                </div>
              </div>

              <div class="step-meta">
                <span v-if="step.type === 'model-call' && step.config.type === 'model-call' && step.config.modelRef.kind === 'fixed'" class="step-model">
                  {{ step.config.modelRef.modelName || '— no model —' }}
                </span>
                <span class="step-namespace">→ {{ step.outputNamespace }}.*</span>
                <span v-if="historyReadCount(step) > 0" class="step-history-badge" :title="`${historyReadCount(step)} history read(s)`">
                  ↩ {{ historyReadCount(step) }}
                </span>
                <span
                  v-if="runStateFor(step.id)"
                  class="step-run-badge"
                  :class="`run-${runStateFor(step.id)}`"
                  :title="runStateTitle(step.id)"
                >
                  {{ stepRunUiStateLabel(runStateFor(step.id)!) }}
                </span>
                <span v-if="!step.enabled" class="step-disabled-badge">disabled</span>
              </div>

              <div v-if="traceFor(step.id)" class="step-trace">
                <span :class="`status-${traceFor(step.id)!.status}`">{{ traceFor(step.id)!.status }}</span>
                <span v-if="traceFor(step.id)!.durationMs !== undefined" class="step-duration">{{ traceFor(step.id)!.durationMs }}ms</span>
              </div>

              <div v-if="outputPreviewFor(step.id)" class="step-output-preview" :title="outputPreviewFor(step.id)!">
                {{ outputPreviewFor(step.id) }}
              </div>

              <div class="step-run-actions" v-if="step.enabled">
                <button
                  type="button"
                  class="btn-run-up-to icon-btn"
                  aria-label="Run up to here"
                  @click.stop="$emit('run-up-to', step.id)"
                  title="Execute pipeline up to this step"
                >▷</button>
                <button
                  type="button"
                  class="btn-run-only-step icon-btn"
                  aria-label="Re-run only this step"
                  @click.stop="$emit('run-only-step', step.id)"
                  title="Re-run only this step (reuses previous outputs for other steps)"
                >↺</button>
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

    <!-- Add step bar -->
    <div class="chain-add-bar">
      <div class="chain-add-bar-header">
        <span class="chain-add-bar-label">Add step</span>
        <div class="undo-redo-controls" v-if="showUndoRedo">
          <button class="btn btn-sm btn-ghost" :disabled="!canUndo" @click="$emit('undo')" :title="lastUndoLabel ? `Undo: ${lastUndoLabel}` : 'Nothing to undo'">↩ Undo</button>
          <button class="btn btn-sm btn-ghost" :disabled="!canRedo" @click="$emit('redo')" :title="lastRedoLabel ? `Redo: ${lastRedoLabel}` : 'Nothing to redo'">↪ Redo</button>
        </div>
      </div>
      <div class="chain-add-bar-buttons">
        <button class="btn btn-sm btn-accent" @click="$emit('append', 'model-call')">+ Model call</button>
        <button class="btn btn-sm" @click="$emit('append', 'prompt-wrapper')">+ Prompt wrapper</button>
        <button class="btn btn-sm" @click="$emit('append', 'presentation')">+ Text</button>
        <button class="btn btn-sm" @click="$emit('append', 'json-extract')">+ JSON extract</button>
        <button class="btn btn-sm" @click="$emit('append', 'loop-group')">+ Loop</button>
        <button v-if="showCapsuleAdd" class="btn btn-sm btn-capsule" @click="$emit('append', 'capsule-instance')">+ Capsule</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {ref, computed, watch, nextTick, onMounted, onUnmounted, defineComponent, h} from 'vue';
import type {PipelineStep, PipelineTraceEvent, StepType} from '@lorca/core';
import {getStepHistoryReads, stepRunUiStateLabel} from '@lorca/pipeline';
import type {StepStaleState} from '@lorca/pipeline';
import {
  DND_STEP_ID,
  isSuggestionDragActive,
  readDragStepId,
  readDragSuggestionId,
} from '../../utils/dragDrop.js';
import {formatArtifactDisplay} from '../../utils/formatArtifact.js';

type DragKind = 'step-reorder' | 'suggestion';

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

const props = defineProps<{
  steps: PipelineStep[];
  selectedStepId: string | null;
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
  acceptSuggestionDrop?: boolean;
}>();

const emit = defineEmits<{
  select: [stepId: string, extendRange?: boolean];
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
  'run-only-step': [stepId: string];
  undo: [];
  redo: [];
}>();

const scrollRef = ref<HTMLElement | null>(null);
const draggingStepId = ref<string | null>(null);
const dragOverStepId = ref<string | null>(null);
const dropTargetIndex = ref<number | null>(null);
const activeDragKind = ref<DragKind | null>(null);
const chainDndHover = ref(false);

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
  'prompt-wrapper': 'Wrapper',
  'presentation': 'Text',
  'json-extract': 'JSON extract',
  'capsule-instance': 'Capsule',
  'loop-group': 'Loop',
};

function stepTypeLabel(type: StepType): string {
  return TYPE_LABELS[type] ?? type;
}

function historyReadCount(step: PipelineStep): number {
  return getStepHistoryReads(step).length;
}

function stepHasModelError(step: PipelineStep): boolean {
  if (step.type !== 'model-call' || step.config.type !== 'model-call') return false;
  const modelRef = step.config.modelRef;
  return modelRef.kind === 'fixed' && (!modelRef.endpointId || !modelRef.modelName);
}

function runStateFor(stepId: string) {
  return props.stepStates?.[stepId]?.state;
}

function outputPreviewFor(stepId: string): string | null {
  const preview = props.runSnapshots?.[stepId]?.primaryOutputPreview;
  if (!preview) return null;
  return formatArtifactDisplay(preview, 200);
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

  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #0c0c0c;
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
  padding: 0 1.4rem;
}

.chain-scroll-spacer {
  flex-shrink: 0;
  height: max(5vh, 20px);
  width: 100%;
}

.chain-step {
  width: 100%;
  max-width: var(--chain-card-max-width);
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
}

.step-connector { color: #444; font-size: 0.85rem; margin: 1px 0; flex-shrink: 0; }

.step-card {
  width: 100%;
  min-height: var(--chain-card-target-height);
  max-height: 50cqh;
  display: flex;
  align-items: stretch;
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  border-radius: 8px;
  padding: 0;
  overflow: hidden;
  cursor: grab;
  transition: border-color 0.15s, background 0.15s, box-shadow 0.15s, opacity 0.15s;
}
.step-card:active { cursor: grabbing; }
.chain-step.dragging .step-card { cursor: grabbing; }
.step-card-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: clamp(0.45rem, 1.3cqh, 0.9rem);
  padding: clamp(1.15rem, 2.6cqh, 2rem) clamp(1.1rem, 2vw, 1.6rem) clamp(1rem, 2cqh, 1.6rem) clamp(0.85rem, 1.5vw, 1.15rem);
}
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

.step-card-header { display: flex; align-items: center; gap: 0.4rem; }
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
  pointer-events: none;
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
.badge-prompt-wrapper { background: #2a2a1a; color: #b8a050; }
.badge-presentation { background: #1e2a1e; color: #5a9d5a; }
.badge-capsule-instance { background: #2a1e3d; color: #9d6db8; }

.step-title {
  flex: 1; font-size: clamp(1.15rem, 2.8cqh, 1.75rem); font-weight: 650;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.step-title.disabled { text-decoration: line-through; color: #555; }

.step-actions { display: flex; gap: 2px; opacity: 0; transition: opacity 0.1s; }
.step-card:hover .step-actions, .chain-step.selected .step-actions { opacity: 1; }

.step-meta { display: flex; gap: 0.55rem; font-size: clamp(0.9rem, 1.9cqh, 1.2rem); color: #555; flex-wrap: wrap; }
.step-model { color: #5a9fd4; }
.step-namespace { color: #666; font-family: monospace; }
.step-disabled-badge { background: #2a2a1a; color: #888; border-radius: 2px; padding: 0 4px; }
.step-history-badge { background: #1a2a3a; color: #6a9fc8; border-radius: 2px; padding: 0 4px; font-family: monospace; }
.step-badge { font-size: clamp(0.74rem, 1.45cqh, 1rem); padding: 1px 6px; border-radius: 2px; }
.step-badge-warn { background: #2a1a0a; color: #e8a020; border: 1px solid #5a3810; }

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

.step-trace { display: flex; gap: 0.55rem; font-size: clamp(0.84rem, 1.7cqh, 1.1rem); }
.status-completed { color: #3a9d6e; }
.status-failed { color: #c0392b; }
.status-started, .status-running { color: #e8a020; }
.status-skipped, .status-cancelled { color: #555; }
.step-duration { color: #444; }

.step-output-preview {
  font-size: clamp(0.9rem, 1.8cqh, 1.15rem);
  color: #888;
  font-family: monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  padding: 0.25rem 0.4rem;
  background: #0d0d0d;
  border-radius: 3px;
  border: 1px solid #1e1e1e;
}

.step-run-actions { margin-top: auto; display: none; gap: 6px; }
.chain-step.selected .step-run-actions { display: flex; }
.btn-run-up-to {
  font-size: clamp(1rem, 2cqh, 1.3rem); padding: 4px 10px;
  background: #1a2e1a; border: 1px solid #2a4d2a; color: #6db86d;
  border-radius: 3px; cursor: pointer;
}
.btn-run-up-to:hover { background: #1e381e; color: #8dda8d; }
.btn-run-only-step {
  font-size: clamp(1rem, 2cqh, 1.3rem); padding: 4px 10px;
  background: #1a1a2e; border: 1px solid #2a2a4d; color: #6d6db8;
  border-radius: 3px; cursor: pointer;
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

.chain-add-bar {
  flex-shrink: 0;
  border-top: 2px solid #2a5070;
  background: linear-gradient(180deg, #0f1418 0%, #111820 100%);
  padding: 0.55rem 0.85rem 0.65rem;
  box-shadow: 0 -4px 16px rgba(0,0,0,0.4);
}
.chain-add-bar-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 0.4rem;
}
.chain-add-bar-label {
  font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.08em;
  color: #7ec8e3; font-weight: 700;
}
.undo-redo-controls { display: flex; gap: 0.25rem; }

.chain-add-bar-buttons { display: flex; gap: 0.35rem; flex-wrap: wrap; }

.btn { background: #1a1a1a; border: 1px solid #2a2a2a; color: #888; border-radius: 4px; cursor: pointer; }
.btn-sm { padding: 3px 9px; font-size: 0.72rem; }
.btn:hover:not(:disabled) { background: #222; color: #ccc; border-color: #3a3a3a; }
.btn:disabled { opacity: 0.35; cursor: default; }
.btn-accent { background: #1e3d52; border-color: #2a5070; color: #7ec8e3; }
.btn-accent:hover:not(:disabled) { background: #254a62; color: #a8dff5; }
.btn-capsule { border-color: #2a3d52; color: #5a9fd4; }
.btn-capsule:hover:not(:disabled) { background: #1a2a3a; }
.btn-ghost { background: none; border-color: transparent; color: #555; }
.btn-ghost:hover:not(:disabled) { background: #1a1a1a; color: #888; border-color: #333; }

.icon-btn { background: none; border: none; color: #555; cursor: pointer; font-size: 0.78rem; padding: 0 2px; }
.icon-btn:hover:not(:disabled) { color: #aaa; }
.icon-btn:disabled { opacity: 0.2; cursor: default; }
.icon-btn.danger:hover:not(:disabled) { color: #e07070; }
</style>
