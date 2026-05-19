<template>
  <div class="chain-editor">
    <div class="chain-viewport">
      <div ref="scrollRef" class="chain-scroll">
        <div class="chain-scroll-spacer" aria-hidden="true" />

        <!-- Insert-at-start button (shown when steps exist) -->
        <div v-if="steps.length > 0" class="insert-zone insert-zone-top">
          <button class="btn-insert" title="Insert step at beginning" @click="$emit('insert-at', 0)">+</button>
        </div>

        <template v-for="(step, i) in steps" :key="step.id">
          <div
            :ref="(el) => setStepRef(step.id, el as HTMLElement | null)"
            class="chain-step"
            :class="{
              selected: selectedStepId === step.id,
              disabled: !step.enabled,
              [traceStatusClass(step.id)]: true,
            }"
            @click="$emit('select', step.id)"
          >
            <div v-if="i > 0" class="step-connector">↓</div>
            <div class="step-card">
              <div class="step-card-header">
                <span class="step-type-badge" :class="`badge-${step.type}`">{{ stepTypeLabel(step.type) }}</span>
                <span class="step-title" :class="{disabled: !step.enabled}">{{ step.label }}</span>
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
                <span v-if="!step.enabled" class="step-disabled-badge">disabled</span>
              </div>

              <div v-if="traceFor(step.id)" class="step-trace">
                <span :class="`status-${traceFor(step.id)!.status}`">{{ traceFor(step.id)!.status }}</span>
                <span v-if="traceFor(step.id)!.durationMs !== undefined" class="step-duration">{{ traceFor(step.id)!.durationMs }}ms</span>
              </div>

              <div class="step-run-actions" v-if="step.enabled">
                <button class="btn-run-up-to" @click.stop="$emit('run-up-to', step.id)" title="Execute pipeline up to this step">
                  ▷ Run up to here
                </button>
              </div>
            </div>
          </div>

          <!-- Insert between steps -->
          <div class="insert-zone">
            <button class="btn-insert" :title="`Insert step after ${step.label}`" @click="$emit('insert-after', step.id)">+</button>
          </div>
        </template>

        <!-- Empty state -->
        <div v-if="steps.length === 0" class="chain-empty">
          <p>No steps yet.</p>
          <button class="btn btn-accent btn-sm" @click="$emit('append', 'model-call')">+ Add Model Call</button>
        </div>

        <!-- Final output indicator -->
        <div v-if="steps.length > 0" class="chain-output-ref">
          <span class="output-label">Output</span>
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
        <button class="btn btn-sm" @click="$emit('append', 'manual-text')">+ Manual text</button>
        <button class="btn btn-sm" @click="$emit('append', 'template')">+ Template</button>
        <button class="btn btn-sm" @click="$emit('append', 'json-extract')">+ JSON extract</button>
        <button v-if="showCapsuleAdd" class="btn btn-sm btn-capsule" @click="$emit('append', 'capsule-instance')">+ Capsule</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {ref, watch, nextTick, onMounted} from 'vue';
import type {PipelineStep, PipelineTraceEvent, StepType} from '@lorca/core';
import {getStepHistoryReads} from '@lorca/pipeline';

const props = defineProps<{
  steps: PipelineStep[];
  selectedStepId: string | null;
  trace: PipelineTraceEvent[];
  finalArtifactKey: string | null;
  showCapsuleAdd?: boolean;
  showUndoRedo?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  lastUndoLabel?: string | null;
  lastRedoLabel?: string | null;
}>();

defineEmits<{
  select: [stepId: string];
  'insert-after': [anchorStepId: string];
  'insert-at': [index: number];
  'move-up': [stepId: string];
  'move-down': [stepId: string];
  duplicate: [stepId: string];
  'toggle-enabled': [stepId: string];
  delete: [stepId: string];
  append: [type: StepType];
  'run-up-to': [stepId: string];
  undo: [];
  redo: [];
}>();

const scrollRef = ref<HTMLElement | null>(null);
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
  'template': 'Template',
  'json-extract': 'JSON extract',
  'manual-text': 'Manual text',
  'capsule-instance': 'Capsule',
  'loop-group': 'Loop',
};

function stepTypeLabel(type: StepType): string {
  return TYPE_LABELS[type] ?? type;
}

function historyReadCount(step: PipelineStep): number {
  return getStepHistoryReads(step).length;
}
</script>

<style scoped>
.chain-editor {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #0c0c0c;
}

.chain-viewport {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  position: relative;
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
  padding: 0 1rem;
}

.chain-scroll-spacer {
  flex-shrink: 0;
  height: max(25vh, 80px);
  width: 100%;
}

.chain-step {
  width: 100%;
  max-width: 480px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.step-connector { color: #444; font-size: 0.85rem; margin: 1px 0; flex-shrink: 0; }

.step-card {
  width: 100%;
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  border-radius: 8px;
  padding: 0.55rem 0.75rem;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, box-shadow 0.15s, opacity 0.15s;
}
.chain-step:not(.selected) .step-card { opacity: 0.7; transform: scale(0.98); }
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
.step-type-badge {
  font-size: 0.6rem; padding: 1px 5px; border-radius: 3px;
  background: #222; color: #666; flex-shrink: 0; text-transform: uppercase; letter-spacing: 0.04em;
}
.badge-model-call { background: #1e2d3d; color: #5a9fd4; }
.badge-prompt-wrapper { background: #2a2a1a; color: #b8a050; }
.badge-template { background: #1e2a1e; color: #5a9d5a; }
.badge-capsule-instance { background: #2a1e3d; color: #9d6db8; }

.step-title {
  flex: 1; font-size: 0.82rem; font-weight: 500;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.step-title.disabled { text-decoration: line-through; color: #555; }

.step-actions { display: flex; gap: 2px; opacity: 0; transition: opacity 0.1s; }
.step-card:hover .step-actions, .chain-step.selected .step-actions { opacity: 1; }

.step-meta { display: flex; gap: 0.4rem; font-size: 0.68rem; color: #555; margin-top: 0.2rem; flex-wrap: wrap; }
.step-model { color: #5a9fd4; }
.step-namespace { color: #666; font-family: monospace; }
.step-disabled-badge { background: #2a2a1a; color: #888; border-radius: 2px; padding: 0 4px; }
.step-history-badge { background: #1a2a3a; color: #6a9fc8; border-radius: 2px; padding: 0 4px; font-family: monospace; }

.step-trace { display: flex; gap: 0.4rem; font-size: 0.68rem; margin-top: 0.15rem; }
.status-completed { color: #3a9d6e; }
.status-failed { color: #c0392b; }
.status-started, .status-running { color: #e8a020; }
.status-skipped, .status-cancelled { color: #555; }
.step-duration { color: #444; }

.step-run-actions { margin-top: 0.3rem; display: none; }
.chain-step.selected .step-run-actions { display: block; }
.btn-run-up-to {
  font-size: 0.68rem; padding: 2px 8px;
  background: #1a2e1a; border: 1px solid #2a4d2a; color: #6db86d;
  border-radius: 3px; cursor: pointer;
}
.btn-run-up-to:hover { background: #1e381e; color: #8dda8d; }

/* Insert zone between steps */
.insert-zone {
  display: flex; justify-content: center; align-items: center;
  height: 20px; width: 100%; max-width: 480px; opacity: 0;
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
  border-radius: 5px; width: 100%; max-width: 480px; flex-shrink: 0;
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
