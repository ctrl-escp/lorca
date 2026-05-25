<template>
  <div
    class="chain-step"
    :class="{
      selected,
      'in-selection-range': inSelectionRange,
      disabled: !step.enabled,
      'model-disabled': modelDisabled,
      'drop-target-step': dropTarget,
      dragging,
      'output-expanded': outputExpanded,
      'partial-run-target': partialRunTarget,
      'has-exec-chip': !!executionChip,
      'exec-running': executionChip?.phase === 'running',
      [traceStatusClass]: true,
    }"
    @click="emit('click', $event)"
    @dragover.prevent="emit('dragover', $event)"
    @dragleave="emit('dragleave', $event)"
    @drop.prevent="emit('drop', $event)"
  >
  <div
    class="step-card"
    @dragend="emit('dragend')"
    @contextmenu.prevent.stop="emit('contextmenu', $event)"
  >
    <div
      class="step-drag-handle"
      aria-hidden="true"
      draggable="true"
      title="Drag to reorder"
      @dragstart="emit('dragstart', $event)"
    >
      <span class="step-drag-grip">⠿</span>
    </div>
    <div class="step-card-content">
    <div class="step-card-header">
      <span class="step-type-badge" :class="`badge-${step.type}`">{{ stepTypeLabel(step.type) }}</span>
      <span
        v-if="step.config.type === 'model-call' && step.config.outputType === 'json'"
        class="step-badge step-badge-json"
        :class="{'step-badge-json-fail': jsonValidFailed(step, artifacts)}"
        title="JSON (strict): step fails if output is not valid JSON"
      >JSON</span>
      <span
        v-else-if="step.config.type === 'model-call' && (!step.config.outputType || step.config.outputType === 'auto') && jsonValidKnown(step, artifacts)"
        class="step-badge step-badge-json"
        :class="{'step-badge-json-fail': !jsonValidPassed(step, artifacts)}"
        :title="jsonValidPassed(step, artifacts) ? 'Last run parsed as JSON' : 'Last run output was not valid JSON'"
      >{{ jsonValidPassed(step, artifacts) ? 'JSON✓' : 'JSON✗' }}</span>
      <span class="step-title" :class="{disabled: !step.enabled}">{{ step.label }}</span>
      <span
        v-if="executionChip"
        class="step-exec-chip"
        :class="`exec-${executionChip!.phase}`"
        :title="executionChip!.title"
        aria-live="polite"
      >
        <span
          v-if="executionChip!.phase === 'running'"
          class="exec-spinner"
          aria-hidden="true"
        />
        {{ executionChip!.label }}
      </span>
      <span v-if="stepHasModelError(step)" class="step-badge step-badge-warn" title="No model selected">no model</span>
      <span v-if="modelDisabled" class="step-badge step-badge-model-off" title="This step's model or endpoint is disabled">model off</span>
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
        <button class="icon-btn" :disabled="index === 0" @click.stop="$emit('move-up', step.id)" title="Move up" aria-label="Move up">
          <StepIcon name="arrow-up" />
        </button>
        <button class="icon-btn" :disabled="index === stepsLength - 1" @click.stop="$emit('move-down', step.id)" title="Move down" aria-label="Move down">
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
          @click.stop="emit('toggle-comment')"
          :title="step.description ? 'Edit comment' : 'Add comment'"
          :aria-label="step.description ? 'Edit comment' : 'Add comment'"
        >
          <StepIcon name="message-square" />
        </button>
        <button
          v-if="step.config.type === 'capsule-instance' && step.config.displayMode !== 'inline'"
          class="inline-action-btn"
          type="button"
          title="Spread this Capsule into editable inline steps"
          @click.stop="$emit('spread-capsule', step.id)"
        >
          Edit inline
        </button>
      </div>
    </div>

    <div class="step-meta">
      <span v-if="step.type === 'model-call' && step.config.type === 'model-call' && step.config.modelRef.kind !== 'slot'" class="step-meta-item">
        <span class="step-meta-label hdr-model">Model</span>
        <span class="step-model">{{ step.config.modelRef.modelName || '— no model —' }}{{ step.config.modelRef.kind === 'any-enabled-endpoint' ? ' (any enabled endpoint)' : '' }}</span>
      </span>
      <span class="step-meta-item">
        <span class="step-meta-label hdr-output">Outputs</span>
        <span class="step-namespace">{{ step.outputNamespace }}.*</span>
      </span>
      <span v-if="historyReadCount(step) > 0" class="step-meta-item">
        <span class="step-meta-label hdr-history">History reads</span>
        <span class="step-history-badge" :title="`${historyReadCount(step)} history read(s)`">{{ historyReadCount(step) }}</span>
      </span>
      <span v-if="runStateFor(step.id, stepStates)" class="step-meta-item">
        <span class="step-meta-label hdr-trace">Result</span>
        <span
          class="step-run-badge"
          :class="`run-${runStateFor(step.id, stepStates)}`"
          :title="runStateTitle(step.id)"
        >{{ stepRunUiStateLabel(runStateFor(step.id, stepStates)!) }}</span>
      </span>
      <span v-if="!step.enabled" class="step-disabled-badge">disabled</span>
      <span v-if="capsuleSourceChanged(step.id, stepStates)" class="step-capsule-status source-changed">source changed</span>
      <span v-if="inlineModified(step.id, stepStates)" class="step-capsule-status inline-modified">modified</span>
    </div>

    <div v-if="step.config.type === 'loop-group'" class="loop-group-body">
      <div class="loop-group-banner" :title="loopExitSummary(step)">
        <span class="loop-group-icon">↺</span>
        <span>Up to {{ step.config.maxIterations }}×</span>
        <span class="loop-group-dot">·</span>
        <span class="loop-group-exit">{{ loopExitSummary(step) }}</span>
        <span
          v-if="executionChip"
          class="step-exec-chip step-exec-chip-compact"
          :class="`exec-${executionChip!.phase}`"
          :title="executionChip!.title"
        >
          <span
            v-if="executionChip!.phase === 'running'"
            class="exec-spinner"
            aria-hidden="true"
          />
          {{ executionChip!.label }}
        </span>
      </div>
      <div v-if="step.config.steps.length === 0" class="loop-inner-empty">
        Empty loop — add inner steps in the Inspector
      </div>
      <ol
        v-else
        class="loop-inner-list"
        :class="{'loop-inner-active-run': executionChip?.phase === 'running'}"
      >
        <li
          v-for="(inner, ii) in step.config.steps"
          :key="inner.id"
          class="loop-inner-item"
          :class="{
            'loop-inner-selected': selectedLoopInnerStepId === inner.id && selectedStepId === step.id,
            'loop-inner-last': ii === step.config.steps.length - 1,
            'loop-inner-active-run': executionChip?.phase === 'running',
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

    <div v-if="step.config.type === 'capsule-instance' && step.config.displayMode === 'inline'" class="capsule-inline-body">
      <div class="capsule-inline-banner">
        <span class="capsule-inline-icon hdr-capsule">Capsule</span>
        <span class="capsule-inline-title">{{ step.label }}</span>
        <span class="capsule-inline-version">{{ step.config.capsuleVersion }}</span>
        <span v-if="step.config.inlineModified" class="capsule-inline-modified-badge">modified</span>
        <div class="capsule-inline-actions">
          <button type="button" @click.stop="$emit('collapse-inline-capsule', step.id)">Collapse</button>
          <button type="button" @click.stop="$emit('lock-inline-capsule', step.id)">Lock as Capsule</button>
          <button type="button" @click.stop="$emit('detach-capsule', step.id)">Detach</button>
        </div>
      </div>
      <div v-if="!step.config.inlineSteps?.length" class="capsule-inline-empty">
        No inline steps
      </div>
      <ol v-else class="capsule-inline-step-list">
        <li
          v-for="(inner, ii) in step.config.inlineSteps"
          :key="inner.id"
          class="capsule-inline-step-item"
          :class="[
            {'capsule-inline-selected': selectedInlineCapsuleInnerStepId === inner.id && selectedStepId === step.id},
            innerExecutionClass(step.id, inner.id),
          ]"
          title="Click to configure inline step"
          @click.stop="$emit('select-inline-capsule-inner', step.id, inner.id)"
        >
          <span class="loop-inner-index">{{ ii + 1 }}</span>
          <span class="loop-inner-type">{{ stepTypeLabel(inner.type) }}</span>
          <span class="capsule-inline-step-label">{{ inner.label }}</span>
          <span
            v-if="innerExecutionChipsByKey[`${step.id}:${inner.id}`]"
            class="step-exec-chip step-exec-chip-compact"
            :class="`exec-${innerExecutionChipsByKey[`${step.id}:${inner.id}`]!.phase}`"
            :title="innerExecutionChipsByKey[`${step.id}:${inner.id}`]!.title"
          >
            <span
              v-if="innerExecutionChipsByKey[`${step.id}:${inner.id}`]!.phase === 'running'"
              class="exec-spinner"
              aria-hidden="true"
            />
            {{ innerExecutionChipsByKey[`${step.id}:${inner.id}`]!.label }}
          </span>
        </li>
      </ol>
    </div>

    <div v-if="step.description || commentExpanded" class="step-comment-wrap">
      <button
        type="button"
        class="step-comment-header"
        :aria-expanded="commentExpanded"
        @click.stop="emit('toggle-comment')"
      >
        <span class="step-comment-toggle">{{ commentExpanded ? '−' : '+' }}</span>
        <span v-if="!commentExpanded && step.description" class="step-comment-preview">{{ step.description }}</span>
        <span v-else class="step-comment-label">Comment</span>
      </button>
      <TextEditor
        v-if="commentExpanded"
        class="step-comment-textarea"
        :model-value="commentDraft"
        placeholder="Add a comment…"
        :rows="3"
        @update:model-value="emit('update:commentDraft', $event)"
        @click.stop
        @keydown.stop
      />
      <div v-if="commentExpanded" class="step-comment-actions">
        <button class="btn btn-sm btn-primary" type="button" @click.stop="emit('save-comment')">Save</button>
        <button class="btn btn-sm btn-ghost" type="button" @click.stop="emit('cancel-comment')">Cancel</button>
      </div>
    </div>

    <div v-if="sourceBadges?.length" class="step-source-badges" aria-label="Step data sources">
      <span class="step-source-label hdr-input">From</span>
      <span
        v-for="source in sourceBadges"
        :key="source.key"
        class="step-source-badge"
        :class="[`source-${source.kind}`, {invalid: source.invalid}]"
        :title="source.title"
      >
        <span v-if="source.kind === 'previous'" class="prev-output-marker" aria-hidden="true">↑</span>{{ source.label }}
      </span>
    </div>

    <div v-if="trace" class="step-trace">
      <span class="step-meta-item">
        <span class="step-meta-label hdr-trace">Execution status</span>
        <span :class="`status-${trace!.status}`">{{ trace!.status }}</span>
      </span>
      <span v-if="trace!.durationMs !== undefined" class="step-meta-item">
        <span class="step-meta-label hdr-config">Duration</span>
        <span class="step-duration">{{ formatDurationMs(trace!.durationMs!) }}</span>
      </span>
    </div>

    <div v-if="outputPreview !== null" class="step-output-preview-wrap">
      <button
        type="button"
        class="step-output-preview-header"
        :aria-expanded="!outputCollapsed"
        :title="outputCollapsed ? 'Expand output preview' : 'Collapse output preview'"
        @click.stop="emit('toggle-output')"
      >
        <span class="step-output-toggle-indicator">{{ outputCollapsed ? '+' : '-' }}</span>
        <span class="step-output-preview-label hdr-output">Output preview</span>
      </button>
      <JsonViewer
        v-if="!outputCollapsed"
        class="step-output-preview"
        :value="outputPreview"
        :show-header="false"
      />
    </div>

    <div
      v-if="dropTarget"
      class="step-drop-banner"
      aria-live="polite"
    >{{ dropHint }}</div>
    </div>
  </div>
  </div>
</template>
<script setup lang="ts">
import type {PipelineArtifact, PipelineStep, PipelineTraceEvent, StepRunSnapshot} from '@lorca/core';
import type {StepStaleState} from '@lorca/pipeline';
import {stepRunUiStateLabel} from '@lorca/pipeline';
import {JsonViewer} from '@lorca/ui-kit';
import {formatDurationMs} from '../../utils/formatDuration.js';
import type {StepExecutionChip} from '../../utils/stepExecutionDisplay.js';
import type {StepDataSourceBadge} from '../../utils/chainStepDataSources.js';
import type {ChainDragKind} from '../../composables/useChainEditorDnd.js';
import {
  capsuleSourceChanged,
  historyReadCount,
  inlineModified,
  jsonValidFailed,
  jsonValidKnown,
  jsonValidPassed,
  loopExitSummary,
  runStateFor,
  stepHasModelError,
} from '../../utils/chainStepDisplay.js';
import {stepTypeLabel} from '../../utils/stepTypeLabels.js';
import TextEditor from '../shared/TextEditor.vue';
import StepIcon from './StepIcon.vue';

const props = defineProps<{
  step: PipelineStep;
  index: number;
  stepsLength: number;
  selected: boolean;
  inSelectionRange: boolean;
  modelDisabled: boolean;
  dropTarget: boolean;
  dragging: boolean;
  outputExpanded: boolean;
  partialRunTarget: boolean;
  traceStatusClass: string;
  executionChip: StepExecutionChip | null;
  sourceBadges: StepDataSourceBadge[];
  innerExecutionChipsByKey: Record<string, StepExecutionChip>;
  selectedLoopInnerStepId?: string | null | undefined;
  selectedInlineCapsuleInnerStepId?: string | null | undefined;
  selectedStepId: string | null;
  dragOverStepId: string | null;
  activeDragKind: ChainDragKind | null;
  dropHint: string;
  trace?: PipelineTraceEvent | undefined;
  stepStates?: Record<string, StepStaleState> | undefined;
  artifacts?: Record<string, PipelineArtifact> | undefined;
  runSnapshots?: Record<string, StepRunSnapshot> | undefined;
  commentExpanded: boolean;
  commentDraft: string;
  outputCollapsed: boolean;
  outputPreview: unknown | null;
}>();

const emit = defineEmits<{
  click: [event: MouseEvent];
  dragover: [event: DragEvent];
  dragleave: [event: DragEvent];
  drop: [event: DragEvent];
  dragstart: [event: DragEvent];
  dragend: [];
  contextmenu: [event: MouseEvent];
  'run-up-to': [stepId: string];
  'run-from': [stepId: string];
  'run-only-step': [stepId: string];
  'move-up': [stepId: string];
  'move-down': [stepId: string];
  duplicate: [stepId: string];
  'toggle-enabled': [stepId: string];
  delete: [stepId: string];
  'spread-capsule': [stepId: string];
  'select-loop-inner': [loopStepId: string, innerStepId: string];
  'select-inline-capsule-inner': [capsuleStepId: string, innerStepId: string];
  'collapse-inline-capsule': [stepId: string];
  'lock-inline-capsule': [stepId: string];
  'detach-capsule': [stepId: string];
  'toggle-comment': [];
  'update:commentDraft': [value: string];
  'save-comment': [];
  'cancel-comment': [];
  'toggle-output': [];
}>();

function innerExecutionClass(capsuleStepId: string, innerStepId: string): string {
  const chip = props.innerExecutionChipsByKey[`${capsuleStepId}:${innerStepId}`];
  if (!chip) return '';
  return `inner-exec-${chip.phase}`;
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
.chain-step {
  width: 100%;
  max-width: var(--chain-card-max-width);
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
}

.step-connector { color: var(--text-muted); font-size: 0.85rem; margin: 1px 0; flex-shrink: 0; }

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
  border-color: var(--accent-border);
  background: #111e2a;
  box-shadow: 0 0 0 1px var(--accent-border), 0 6px 18px rgba(0,0,0,0.3);
}
.chain-step.disabled .step-card { opacity: 0.45; border-style: dashed; }

.trace-completed .step-card { border-left: 3px solid #3a9d6e; }
.trace-failed .step-card { border-left: 3px solid #c0392b; }
.trace-running .step-card, .trace-started .step-card { border-left: 3px solid #e8a020; }
.trace-skipped .step-card { opacity: 0.4; }
.trace-cancelled .step-card { border-left: 3px solid #666; }

.chain-step.has-exec-chip:not(.selected) .step-card { opacity: 0.92; }
.chain-step.exec-running:not(.selected) .step-card {
  opacity: 1;
  box-shadow: 0 0 0 1px rgba(232, 160, 32, 0.22);
}

.step-exec-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.12rem 0.5rem;
  border-radius: 999px;
  font-size: clamp(0.68rem, 1.3cqh, 0.85rem);
  font-weight: 600;
  letter-spacing: 0.02em;
  flex-shrink: 0;
}
.step-exec-chip-compact {
  margin-left: auto;
  font-size: 0.68rem;
  padding: 0.08rem 0.4rem;
}
.exec-running { background: #3a2808; color: #f0b040; border: 1px solid #805010; }
.exec-completed { background: #1a2e1a; color: #5a9d5a; border: 1px solid #2a5a3a; }
.exec-failed { background: #2e1a1a; color: #e07070; border: 1px solid #7a3030; }
.exec-skipped, .exec-cancelled { background: #1a1a1a; color: var(--text-secondary); border: 1px solid #333; }
.exec-spinner {
  width: 0.65rem;
  height: 0.65rem;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: exec-spin 0.75s linear infinite;
  flex-shrink: 0;
}
@keyframes exec-spin { to { transform: rotate(360deg); } }

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
  color: var(--text-secondary);
  user-select: none;
}
.step-drag-grip {
  font-size: 0.9rem;
  line-height: 1;
  letter-spacing: -0.12em;
}
.chain-step:hover .step-drag-handle { color: var(--text-secondary); background: #1c1c1c; }
.chain-step.selected .step-drag-handle {
  background: #0e1822;
  border-right-color: var(--accent-border);
  color: #6a9fc8;
}
.chain-step.selected:hover .step-drag-handle { background: #152535; color: #8ec8e8; }
.step-card-content :is(button, input, select, .text-editor) { cursor: pointer; }
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
.chain-empty-drop-slot { width: 100%; margin-bottom: 0.75rem; }
.chain-empty-hint { font-size: 0.72rem; color: var(--text-secondary); margin: 0; }
.step-type-badge {
  font-size: clamp(0.7rem, 1.5cqh, 0.95rem); padding: 2px 7px; border-radius: 3px;
  background: #222; color: var(--text-label); flex-shrink: 0; text-transform: uppercase; letter-spacing: 0.04em;
}
.badge-model-call { background: #1e2d3d; color: #5a9fd4; }
.badge-presentation { background: #1e2a1e; color: #5a9d5a; }
.badge-capsule-instance { background: #2a1e3d; color: #9d6db8; }

.step-title {
  flex: 1 1 10rem; min-width: 0; font-size: clamp(1.05rem, 2.3cqh, 1.45rem); font-weight: 650;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.step-title.disabled { text-decoration: line-through; color: var(--text-secondary); }

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

.step-meta { display: flex; gap: 0.55rem 1.25rem; font-size: clamp(0.86rem, 1.7cqh, 1.05rem); color: var(--text-secondary); flex-wrap: wrap; align-items: center; }
.step-meta-item { display: inline-flex; align-items: center; gap: 0.28rem; min-width: 0; max-width: 100%; }
.step-meta-label { font-size: clamp(0.6rem, 1.15cqh, 0.75rem); font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; flex-shrink: 0; }
.step-model { color: #5a9fd4; }
.step-model,
.step-namespace {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.step-namespace { color: var(--text-label); font-family: monospace; }
.step-disabled-badge { background: #2a2a1a; color: var(--text-label); border-radius: 2px; padding: 0 4px; }
.step-capsule-status {
  border-radius: 2px;
  padding: 0 5px;
  font-size: clamp(0.64rem, 1.25cqh, 0.85rem);
  text-transform: lowercase;
}
.step-capsule-status.source-changed {
  background: #2a2418;
  color: #d0a85a;
  border: 1px solid #4a3d1a;
}
.step-capsule-status.inline-modified {
  background: #21182a;
  color: #c6b4d8;
  border: 1px solid #3a3245;
}
.step-history-badge { background: var(--accent-bg-muted); color: #6a9fc8; border-radius: 2px; padding: 0 4px; font-family: monospace; }
.step-badge { font-size: clamp(0.74rem, 1.45cqh, 1rem); padding: 1px 6px; border-radius: 2px; }
.step-badge-warn { background: #2a1a0a; color: #e8a020; border: 1px solid #5a3810; }
.step-badge-model-off { background: #2a2010; color: #c8a030; border: 1px solid #4a3a10; }
.step-badge-json { background: #1a2a1a; color: #60c060; border: 1px solid #2a5a2a; font-size: clamp(0.64rem, 1.25cqh, 0.85rem); font-weight: 700; letter-spacing: 0.05em; }
.step-badge-json-fail { background: #2a1a1a; color: #e06060; border-color: #5a2a2a; }
.chain-step.model-disabled .step-card { border-left: 3px solid #7a6020; }

.step-run-badge {
  border-radius: 2px; padding: 1px 6px; font-size: clamp(0.74rem, 1.45cqh, 1rem); text-transform: lowercase;
}
.run-not-run { background: #1a1a1a; color: var(--text-secondary); }
.run-current { background: #1a2e1a; color: #5a9d5a; }
.run-stale { background: #2e2a1a; color: #c8a050; }
.run-failed-current { background: #2e1a1a; color: #c07070; }
.run-failed-stale { background: #2e1a1a; color: #a05050; border: 1px dashed #804040; }
.run-disabled { background: #1a1a1a; color: var(--text-muted); }
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
.step-source-badge.invalid { border-color: #7a3030; background: #2a1414; color: #e08080; }
.prev-output-marker { opacity: 0.65; margin-right: 0.25em; font-size: 0.85em; }

.step-trace { display: flex; gap: 0.55rem; font-size: clamp(0.84rem, 1.7cqh, 1.1rem); }
.status-completed { color: #3a9d6e; }
.status-failed { color: #c0392b; }
.status-started, .status-running { color: #e8a020; }
.status-skipped, .status-cancelled { color: var(--text-secondary); }
.step-duration { color: var(--text-muted); }

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
  color: var(--text-label);
  font-family: monospace;
  font-size: clamp(0.86rem, 1.7cqh, 1.1rem);
  font-weight: 700;
}
.step-output-preview-label {
  flex: 1;
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
  color: var(--text-label);
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
.btn:disabled { opacity: 0.35; cursor: default; }
.btn-accent { background: var(--accent-bg); border-color: var(--accent-border); color: var(--accent); }
.btn-accent:hover:not(:disabled) { background: var(--accent-bg-hover); color: #a8dff5; }
.btn-capsule { border-color: #2a3d52; color: #5a9fd4; }
.btn-capsule:hover:not(:disabled) { background: var(--accent-bg-muted); }
.btn-primary { background: var(--accent-bg); border-color: var(--accent-border); color: var(--accent); }
.btn-primary:hover:not(:disabled) { background: var(--accent-bg-hover); color: #a8dff5; }
.btn-ghost { background: none; border-color: transparent; color: var(--text-secondary); }
.btn-ghost:hover:not(:disabled) { background: #1a1a1a; color: var(--text-label); border-color: #333; }

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
  color: var(--text-secondary);
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
  cursor: text;
}
.step-comment-textarea :deep(.cm-editor) {
  background: #0a0900;
  border: none;
  border-top: 1px solid #2a2510;
  color: #c8a840;
  font-size: clamp(0.9rem, 1.8cqh, 1.15rem);
  font-family: inherit;
  line-height: 1.5;
}
.step-card-content .step-comment-textarea { cursor: text; }
.step-comment-textarea :deep(.cm-content) {
  padding: 0.55rem 0.65rem;
  font-family: inherit;
}
.step-comment-textarea :deep(.cm-focused) { background: #0c0a00; border-top-color: #4a3d18; }
.step-comment-textarea :deep(.cm-placeholder) { color: #4a4010; }
.step-comment-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.45rem;
  padding: 0.45rem 0.55rem 0.5rem;
  border-top: 1px solid #2a2510;
  background: #0b0a03;
}
.inline-action-btn {
  grid-column: span 2;
  min-width: calc(var(--step-action-size) * 2 + 0.35rem);
  height: var(--step-action-size);
  border: 1px solid #3a4452;
  background: #151a20;
  color: #9fb7d0;
  border-radius: 4px;
  padding: 0 0.75rem;
  font-size: 0.7rem;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
}
.inline-action-btn:hover {
  border-color: #4d6680;
  background: #1a222b;
  color: #c8d8e8;
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
.loop-group-icon { font-size: 1rem; color: var(--accent); }
.loop-group-dot { color: var(--text-muted); }
.loop-group-exit { color: #9ab8d0; font-family: monospace; font-size: 0.85em; }
.loop-inner-empty { font-size: 0.78rem; color: var(--text-secondary); margin: 0; }
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
.loop-inner-active-run:not(.loop-inner-selected) {
  border-color: #805010;
  border-style: dashed;
  background: #1a1408;
}
.loop-inner-list.loop-inner-active-run {
  box-shadow: inset 0 0 0 1px rgba(232, 160, 32, 0.15);
  border-radius: 6px;
}
.loop-inner-index { color: var(--text-secondary); min-width: 1.1rem; font-family: monospace; }
.loop-inner-type {
  font-size: 0.62rem;
  padding: 1px 5px;
  background: var(--accent-bg-muted);
  color: var(--accent);
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
  color: var(--text-secondary);
}
.loop-prev-hint code { color: #6a8ab0; font-size: 0.65rem; }

.capsule-inline-body {
  margin: 0.45rem 0 0.2rem;
  padding: 0.55rem 0.65rem;
  background: #111316;
  border: 1px solid #333842;
  border-left: 3px solid #8e6db2;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.capsule-inline-banner {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem;
  color: #c6b4d8;
  font-size: clamp(0.72rem, 1.4cqh, 0.88rem);
}
.capsule-inline-icon {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
}
.capsule-inline-title { color: #ddd; }
.capsule-inline-version {
  color: #8b7a9c;
  font-family: monospace;
  font-size: 0.85em;
}
.capsule-inline-modified-badge {
  padding: 1px 6px;
  background: #2a2418;
  color: #d0a85a;
  border-radius: 3px;
  font-size: 0.64rem;
}
.capsule-inline-actions {
  display: flex;
  gap: 0.35rem;
  margin-left: auto;
}
.capsule-inline-actions button {
  border: 1px solid #3a3245;
  background: #17131c;
  color: #c6b4d8;
  border-radius: 4px;
  padding: 0.2rem 0.45rem;
  font-size: 0.68rem;
  cursor: pointer;
}
.capsule-inline-actions button:hover {
  border-color: #5a4770;
  background: #21182a;
}
.capsule-inline-empty { font-size: 0.78rem; color: var(--text-secondary); margin: 0; }
.capsule-inline-step-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.capsule-inline-step-item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.5rem;
  background: #0e0f12;
  border: 1px solid #25262c;
  border-radius: 4px;
  cursor: pointer;
  font-size: clamp(0.75rem, 1.45cqh, 0.92rem);
}
.capsule-inline-step-item:hover { border-color: #4a3f5a; background: #15121a; }
.capsule-inline-selected { border-color: #7d5aa0; background: #1d1628; }
.inner-exec-running:not(.capsule-inline-selected) { border-color: #805010; background: #241a08; }
.inner-exec-completed:not(.capsule-inline-selected) { border-color: #2a5a3a; }
.inner-exec-failed:not(.capsule-inline-selected) { border-color: #7a3030; background: #2a1414; }
.capsule-inline-step-label { flex: 1; color: #ccc; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
}
</style>
