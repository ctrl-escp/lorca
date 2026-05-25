import type {PipelineArtifact, PipelineError, PipelineStep, PipelineTraceEvent, StepRunSnapshot} from '@lorca/core';
import {getStepHistoryReads, formatLoopExitSummary} from '@lorca/pipeline';
import type {StepStaleState} from '@lorca/pipeline';
import {formatArtifactDisplay} from './formatArtifact.js';
import {
  resolveCapsuleInnerStepExecution,
  resolveTopLevelStepExecution,
  traceStatusClassForChip,
  type ResolveStepExecutionOptions,
  type StepExecutionChip,
} from './stepExecutionDisplay.js';

export function buildExecutionChipsByStepId(
  steps: readonly PipelineStep[],
  trace: readonly PipelineTraceEvent[],
  options: {
    finalArtifactKey: string | null;
    runSnapshots?: Record<string, StepRunSnapshot>;
    runStatus?: 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';
    runError?: PipelineError | null;
  },
): Record<string, StepExecutionChip> {
  const chips: Record<string, StepExecutionChip> = {};
  for (const step of steps) {
    const resolveOptions: ResolveStepExecutionOptions = {
      finalArtifactKey: options.finalArtifactKey,
      outputNamespace: step.outputNamespace,
      capsuleHasInnerFailure: step.config.type === 'capsule-instance',
    };
    if (options.runStatus !== undefined) resolveOptions.runStatus = options.runStatus;
    if (options.runError !== undefined) resolveOptions.runError = options.runError;
    const snapshot = options.runSnapshots?.[step.id];
    if (snapshot) resolveOptions.runSnapshot = snapshot;

    const chip = resolveTopLevelStepExecution(step.id, trace, resolveOptions);
    if (chip) chips[step.id] = chip;
  }
  return chips;
}

export function buildInnerExecutionChipsByKey(
  steps: readonly PipelineStep[],
  trace: readonly PipelineTraceEvent[],
  runSnapshots?: Record<string, StepRunSnapshot>,
  runStatus?: 'idle' | 'running' | 'completed' | 'failed' | 'cancelled',
): Record<string, StepExecutionChip> {
  const chips: Record<string, StepExecutionChip> = {};
  for (const step of steps) {
    if (step.config.type !== 'capsule-instance' || step.config.displayMode !== 'inline') continue;
    for (const inner of step.config.inlineSteps ?? []) {
      const chip = resolveCapsuleInnerStepExecution(
        step.id,
        inner.id,
        trace,
        runSnapshots,
        runStatus,
      );
      if (chip) chips[`${step.id}:${inner.id}`] = chip;
    }
  }
  return chips;
}

export function innerExecutionClass(
  chipsByKey: Record<string, StepExecutionChip>,
  capsuleStepId: string,
  innerStepId: string,
): string {
  const chip = chipsByKey[`${capsuleStepId}:${innerStepId}`];
  if (!chip) return '';
  return `inner-exec-${chip.phase}`;
}

export function resolveTraceForStep(
  stepId: string,
  steps: readonly PipelineStep[],
  trace: readonly PipelineTraceEvent[],
  options: {
    runStatus?: 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';
    runError?: PipelineError | null;
    finalArtifactKey: string | null;
    runSnapshots?: Record<string, StepRunSnapshot>;
  },
): PipelineTraceEvent | undefined {
  const stepEvents = trace.filter(
    (e) => (e.stepId === stepId || e.nodeId === stepId) && !e.capsuleInstanceId,
  );
  const failed = stepEvents.find((e) => e.status === 'failed');
  if (failed) return failed;

  const step = steps.find((s) => s.id === stepId);
  if (step?.config.type === 'capsule-instance') {
    const innerFailed = trace.find(
      (e) => e.capsuleInstanceId === stepId && e.status === 'failed',
    );
    if (innerFailed) return innerFailed;
  }

  if (
    options.runStatus === 'failed'
    && options.runError
    && options.finalArtifactKey
    && step
    && options.finalArtifactKey.startsWith(`${step.outputNamespace}.`)
    && (options.runError.code === 'final_output_missing' || options.runError.nodeId === stepId)
  ) {
    return {
      runId: '',
      stepId,
      nodeId: stepId,
      status: 'failed',
      timestamp: '',
      error: options.runError,
    };
  }

  const snapshot = options.runSnapshots?.[stepId];
  if (snapshot?.status === 'failed') {
    const snapFailed = stepEvents.find((e) => e.status === 'failed');
    if (snapFailed) return snapFailed;
  }

  return [...stepEvents].reverse().find(
    (e) => e.status === 'completed' || e.status === 'started',
  );
}

export function traceStatusClassForStep(
  stepId: string,
  executionChips: Record<string, StepExecutionChip>,
  traceEvent: PipelineTraceEvent | undefined,
): string {
  const chip = executionChips[stepId];
  if (chip) return traceStatusClassForChip(chip);
  return traceEvent ? `trace-${traceEvent.status}` : '';
}

export function loopExitSummary(step: PipelineStep): string {
  if (step.config.type !== 'loop-group') return '';
  return formatLoopExitSummary(step.config.exitCondition);
}

export function historyReadCount(step: PipelineStep): number {
  return getStepHistoryReads(step).length;
}

export function stepHasModelError(step: PipelineStep): boolean {
  if (step.type !== 'model-call' || step.config.type !== 'model-call') return false;
  const modelRef = step.config.modelRef;
  if (modelRef.kind === 'fixed') return !modelRef.endpointId || !modelRef.modelName;
  if (modelRef.kind === 'any-enabled-endpoint') return !modelRef.modelName;
  return false;
}

export function jsonValidFailed(step: PipelineStep, artifacts?: Record<string, PipelineArtifact>): boolean {
  return artifacts?.[`${step.outputNamespace}.jsonValid`]?.value === false;
}

export function jsonValidKnown(step: PipelineStep, artifacts?: Record<string, PipelineArtifact>): boolean {
  return `${step.outputNamespace}.jsonValid` in (artifacts ?? {});
}

export function jsonValidPassed(step: PipelineStep, artifacts?: Record<string, PipelineArtifact>): boolean {
  return artifacts?.[`${step.outputNamespace}.jsonValid`]?.value === true;
}

export function outputPreviewValueFor(
  step: PipelineStep,
  artifacts?: Record<string, PipelineArtifact>,
  runSnapshots?: Record<string, StepRunSnapshot>,
): unknown | null {
  const key = `${step.outputNamespace}.${step.primaryOutputName}`;
  const artifact = artifacts?.[key];
  if (artifact) return artifact.value;

  const preview = runSnapshots?.[step.id]?.primaryOutputPreview;
  if (!preview) return null;
  return formatArtifactDisplay(preview, 1200);
}

export function capsuleSourceChanged(stepId: string, stepStates?: Record<string, StepStaleState>): boolean {
  return stepStates?.[stepId]?.capsuleSourceChanged ?? false;
}

export function inlineModified(stepId: string, stepStates?: Record<string, StepStaleState>): boolean {
  return stepStates?.[stepId]?.inlineModified ?? false;
}

export function runStateFor(stepId: string, stepStates?: Record<string, StepStaleState>) {
  return stepStates?.[stepId]?.state;
}
