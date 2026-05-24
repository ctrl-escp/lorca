import type {PipelineStep, PipelineTraceEvent, StepRunSnapshot} from '@lorca/core';
import {inlineCapsuleSnapshotKey} from './inlineCapsuleRun.js';

export interface CapsuleTraceScope {
  capsuleInstanceId: string;
  innerSteps: readonly PipelineStep[];
}

const PRIOR_RUN_ID = 'prior-run';

function eventsForInnerStep(
  trace: readonly PipelineTraceEvent[],
  capsuleInstanceId: string,
  innerStepId: string,
): PipelineTraceEvent[] {
  return trace.filter(
    (e) => e.capsuleInstanceId === capsuleInstanceId
      && (e.stepId === innerStepId || e.nodeId === innerStepId),
  );
}

function syntheticFromSnapshot(
  capsuleInstanceId: string,
  innerStep: PipelineStep,
  snapshot: StepRunSnapshot,
): PipelineTraceEvent {
  const stepId = innerStep.id;
  return {
    runId: PRIOR_RUN_ID,
    stepId,
    nodeId: stepId,
    capsuleInstanceId,
    status: snapshot.status === 'failed' ? 'failed' : 'completed',
    timestamp: snapshot.completedAt,
    outputArtifactNames: snapshot.outputArtifactRefs.length > 0 ? [...snapshot.outputArtifactRefs] : undefined,
  };
}

export function listInlineCapsuleTraceScopes(steps: readonly PipelineStep[]): CapsuleTraceScope[] {
  const scopes: CapsuleTraceScope[] = [];
  for (const step of steps) {
    if (step.config.type !== 'capsule-instance' || step.config.displayMode !== 'inline') continue;
    const innerSteps = step.config.inlineSteps ?? [];
    if (innerSteps.length === 0) continue;
    scopes.push({capsuleInstanceId: step.id, innerSteps});
  }
  return scopes;
}

/** Add snapshot-backed rows for inline inner steps missing from the live trace. */
export function enrichTraceWithCapsuleSnapshots(
  trace: readonly PipelineTraceEvent[],
  snapshots: Record<string, StepRunSnapshot> | undefined,
  scopes: readonly CapsuleTraceScope[],
): PipelineTraceEvent[] {
  const events = [...trace];
  for (const scope of scopes) {
    for (const inner of scope.innerSteps) {
      if (eventsForInnerStep(events, scope.capsuleInstanceId, inner.id).length > 0) continue;
      const snapshot = snapshots?.[inlineCapsuleSnapshotKey(scope.capsuleInstanceId, inner.id)];
      if (snapshot) {
        events.push(syntheticFromSnapshot(scope.capsuleInstanceId, inner, snapshot));
      }
    }
  }
  return sortTraceEvents(events, scopes);
}

function sortTraceEvents(
  events: PipelineTraceEvent[],
  scopes: readonly CapsuleTraceScope[],
): PipelineTraceEvent[] {
  const innerOrder = new Map<string, number>();
  for (const scope of scopes) {
    scope.innerSteps.forEach((step, index) => {
      innerOrder.set(`${scope.capsuleInstanceId}:${step.id}`, index);
    });
  }

  return [...events].sort((a, b) => {
    const aKey = a.capsuleInstanceId && a.stepId ? `${a.capsuleInstanceId}:${a.stepId}` : '';
    const bKey = b.capsuleInstanceId && b.stepId ? `${b.capsuleInstanceId}:${b.stepId}` : '';
    const aOrder = innerOrder.get(aKey);
    const bOrder = innerOrder.get(bKey);
    if (aOrder !== undefined && bOrder !== undefined && aOrder !== bOrder) {
      return aOrder - bOrder;
    }
    if (aOrder !== undefined && bOrder === undefined) return 1;
    if (aOrder === undefined && bOrder !== undefined) return -1;
    return a.timestamp.localeCompare(b.timestamp);
  });
}

export function filterTraceEvents(
  events: readonly PipelineTraceEvent[],
  options: {
    capsuleInstanceId?: string | null;
    selectedStepId?: string | null;
    filterToSelected?: boolean;
  },
): PipelineTraceEvent[] {
  let filtered = [...events];
  if (options.capsuleInstanceId) {
    const capsuleId = options.capsuleInstanceId;
    filtered = filtered.filter(
      (e) => e.capsuleInstanceId === capsuleId
        || e.stepId === capsuleId
        || e.nodeId === capsuleId,
    );
  }
  if (options.filterToSelected && options.selectedStepId && !options.capsuleInstanceId) {
    const id = options.selectedStepId;
    filtered = filtered.filter((e) => e.stepId === id || e.nodeId === id);
  }
  return filtered;
}

export function isPriorRunTraceEvent(event: PipelineTraceEvent): boolean {
  return event.runId === PRIOR_RUN_ID;
}

export function resolveActiveCapsuleTraceScope(
  steps: readonly PipelineStep[],
  selectedStep: PipelineStep | null | undefined,
  selectedInnerStepId: string | null | undefined,
): CapsuleTraceScope | null {
  if (selectedStep?.config.type === 'capsule-instance' && selectedStep.config.displayMode === 'inline') {
    const innerSteps = selectedStep.config.inlineSteps ?? [];
    return innerSteps.length > 0 ? {capsuleInstanceId: selectedStep.id, innerSteps} : null;
  }
  if (!selectedInnerStepId) return null;
  for (const step of steps) {
    if (step.config.type !== 'capsule-instance' || step.config.displayMode !== 'inline') continue;
    if ((step.config.inlineSteps ?? []).some((inner) => inner.id === selectedInnerStepId)) {
      return {capsuleInstanceId: step.id, innerSteps: step.config.inlineSteps ?? []};
    }
  }
  return null;
}
