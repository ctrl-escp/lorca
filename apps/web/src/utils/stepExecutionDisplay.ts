import type {PipelineError, PipelineTraceEvent, StepRunSnapshot} from '@lorca/core';
import {inlineCapsuleSnapshotKey} from './inlineCapsuleRun.js';
import {formatDurationMs} from './formatDuration.js';

export type RunDisplayStatus = 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';

export type StepExecPhase = 'running' | 'completed' | 'failed' | 'skipped' | 'cancelled';

export interface StepExecutionChip {
  phase: StepExecPhase;
  label: string;
  title: string;
  durationMs?: number;
}

const PHASE_LABELS: Record<StepExecPhase, string> = {
  running: 'Running',
  completed: 'Done',
  failed: 'Failed',
  skipped: 'Skipped',
  cancelled: 'Cancelled',
};

function matchesStepId(event: PipelineTraceEvent, stepId: string): boolean {
  return event.stepId === stepId || event.nodeId === stepId;
}

export function traceEventsForStep(
  trace: readonly PipelineTraceEvent[],
  stepId: string,
  options?: {capsuleInstanceId?: string | null; topLevelOnly?: boolean},
): PipelineTraceEvent[] {
  return trace.filter((event) => {
    if (options?.topLevelOnly && event.capsuleInstanceId) return false;
    if (options?.capsuleInstanceId) {
      return event.capsuleInstanceId === options.capsuleInstanceId
        && matchesStepId(event, stepId);
    }
    return matchesStepId(event, stepId);
  });
}

function latestTerminalEvent(events: readonly PipelineTraceEvent[]): PipelineTraceEvent | undefined {
  const failed = events.find((e) => e.status === 'failed');
  if (failed) return failed;
  return [...events].reverse().find(
    (e) => e.status === 'completed' || e.status === 'skipped' || e.status === 'cancelled',
  );
}

function phaseFromStatus(status: PipelineTraceEvent['status']): StepExecPhase | null {
  switch (status) {
    case 'started': return 'running';
    case 'completed': return 'completed';
    case 'failed': return 'failed';
    case 'skipped': return 'skipped';
    case 'cancelled': return 'cancelled';
    default: return null;
  }
}

function chipFromEvent(event: PipelineTraceEvent, extraTitle?: string): StepExecutionChip {
  const phase = phaseFromStatus(event.status)!;
  const label = PHASE_LABELS[phase];
  const parts = [label];
  if (event.durationMs !== undefined) parts.push(formatDurationMs(event.durationMs));
  if (extraTitle) parts.push(extraTitle);
  if (event.error?.message) parts.push(event.error.message);
  return {
    phase,
    label,
    title: parts.join(' · '),
    ...(event.durationMs !== undefined ? {durationMs: event.durationMs} : {}),
  };
}

function resolveFromEvents(events: readonly PipelineTraceEvent[]): StepExecutionChip | null {
  if (events.length === 0) return null;

  const failed = events.find((e) => e.status === 'failed');
  if (failed) return chipFromEvent(failed);

  const latest = events.at(-1)!;
  if (latest.status === 'started') {
    return {phase: 'running', label: PHASE_LABELS.running, title: 'Step is executing'};
  }

  const terminal = latestTerminalEvent(events);
  if (!terminal) return null;
  return chipFromEvent(terminal);
}

export interface ResolveStepExecutionOptions {
  runStatus?: RunDisplayStatus;
  runError?: PipelineError | null;
  finalArtifactKey?: string | null;
  outputNamespace?: string;
  runSnapshot?: StepRunSnapshot;
  capsuleHasInnerFailure?: boolean;
}

/** Resolve a header chip for a top-level pipeline step from trace + run context. */
export function resolveTopLevelStepExecution(
  stepId: string,
  trace: readonly PipelineTraceEvent[],
  options: ResolveStepExecutionOptions = {},
): StepExecutionChip | null {
  const events = traceEventsForStep(trace, stepId, {topLevelOnly: true});

  if (options.capsuleHasInnerFailure) {
    const innerFailed = trace.find(
      (e) => e.capsuleInstanceId === stepId && e.status === 'failed',
    );
    if (innerFailed) return chipFromEvent(innerFailed, 'Inner capsule step failed');
  }

  if (
    options.runStatus === 'failed'
    && options.runError
    && options.finalArtifactKey
    && options.outputNamespace
    && options.finalArtifactKey.startsWith(`${options.outputNamespace}.`)
    && (options.runError.code === 'final_output_missing' || options.runError.nodeId === stepId)
  ) {
    return {
      phase: 'failed',
      label: PHASE_LABELS.failed,
      title: [PHASE_LABELS.failed, options.runError.message].filter(Boolean).join(' · '),
    };
  }

  const fromTrace = resolveFromEvents(events);
  if (fromTrace) return fromTrace;

  if (options.runSnapshot?.status === 'failed') {
    return {
      phase: 'failed',
      label: PHASE_LABELS.failed,
      title: 'Step failed on the last run',
    };
  }

  if (options.runSnapshot && options.runStatus !== 'running') {
    return {
      phase: 'completed',
      label: PHASE_LABELS.completed,
      title: 'Completed on the last run',
    };
  }

  return null;
}

/** Resolve execution chip for an inline capsule inner step. */
export function resolveCapsuleInnerStepExecution(
  capsuleInstanceId: string,
  innerStepId: string,
  trace: readonly PipelineTraceEvent[],
  runSnapshots?: Record<string, StepRunSnapshot>,
  runStatus?: RunDisplayStatus,
): StepExecutionChip | null {
  const events = traceEventsForStep(trace, innerStepId, {capsuleInstanceId});
  const fromTrace = resolveFromEvents(events);
  if (fromTrace) return fromTrace;

  const snapshot = runSnapshots?.[inlineCapsuleSnapshotKey(capsuleInstanceId, innerStepId)];
  if (!snapshot || runStatus === 'running') return null;

  if (snapshot.status === 'failed') {
    return {phase: 'failed', label: PHASE_LABELS.failed, title: 'Failed on the last run'};
  }
  return {phase: 'completed', label: PHASE_LABELS.completed, title: 'Completed on the last run'};
}

export function traceStatusClassForChip(chip: StepExecutionChip | null): string {
  if (!chip) return '';
  switch (chip.phase) {
    case 'running': return 'trace-started';
    case 'completed': return 'trace-completed';
    case 'failed': return 'trace-failed';
    case 'skipped': return 'trace-skipped';
    case 'cancelled': return 'trace-cancelled';
    default: return '';
  }
}
