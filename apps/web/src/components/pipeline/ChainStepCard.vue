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

    <ChainStepLoopGroupBody
      v-if="step.config.type === 'loop-group'"
      :step="step"
      :execution-chip="executionChip"
      :selected-loop-inner-step-id="selectedLoopInnerStepId"
      :selected-step-id="selectedStepId"
      @select-inner="emit('select-loop-inner', step.id, $event)"
    />

    <ChainStepInlineCapsuleBody
      v-if="step.config.type === 'capsule-instance' && step.config.displayMode === 'inline'"
      :step="step"
      :inner-execution-chips-by-key="innerExecutionChipsByKey"
      :selected-inline-inner-step-id="selectedInlineCapsuleInnerStepId"
      :selected-step-id="selectedStepId"
      @collapse="emit('collapse-inline-capsule', step.id)"
      @lock="emit('lock-inline-capsule', step.id)"
      @detach="emit('detach-capsule', step.id)"
      @select-inner="emit('select-inline-capsule-inner', step.id, $event)"
    />

    <ChainStepCardComment
      :description="step.description"
      :expanded="commentExpanded"
      :draft="commentDraft"
      @toggle="emit('toggle-comment')"
      @update:draft="emit('update:commentDraft', $event)"
      @save="emit('save-comment')"
      @cancel="emit('cancel-comment')"
    />

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

    <ChainStepCardOutputPreview
      v-if="outputPreview !== null"
      :preview="outputPreview"
      :collapsed="outputCollapsed"
      @toggle="emit('toggle-output')"
    />

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
  runStateFor,
  stepHasModelError,
} from '../../utils/chainStepDisplay.js';
import {stepTypeLabel} from '../../utils/stepTypeLabels.js';
import StepIcon from './StepIcon.vue';
import ChainStepLoopGroupBody from './ChainStepLoopGroupBody.vue';
import ChainStepInlineCapsuleBody from './ChainStepInlineCapsuleBody.vue';
import ChainStepCardComment from './ChainStepCardComment.vue';
import ChainStepCardOutputPreview from './ChainStepCardOutputPreview.vue';

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
<style src="./chainStepCard.css"></style>
