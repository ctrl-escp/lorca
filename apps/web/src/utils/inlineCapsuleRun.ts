import type {PipelineStep} from '@lorca/core';

export interface InlineCapsuleRunScope {
  capsuleStepId: string;
  capsuleStep: PipelineStep;
  innerStepId: string;
  innerStep: PipelineStep;
  instancePrefix: string;
}

export function inlineCapsuleSnapshotKey(capsuleStepId: string, innerStepId: string): string {
  return `${capsuleStepId}:${innerStepId}`;
}

export function inlineCapsuleArtifactKey(instancePrefix: string, localArtifactKey: string): string {
  return `${instancePrefix}.internal.${localArtifactKey}`;
}

export function resolveInlineCapsuleRunScope(
  selectedStep: PipelineStep | null | undefined,
  selectedInnerStepId: string | null | undefined,
): InlineCapsuleRunScope | null {
  if (!selectedStep || selectedStep.config.type !== 'capsule-instance') return null;
  if (selectedStep.config.displayMode !== 'inline' || !selectedInnerStepId) return null;
  const innerStep = selectedStep.config.inlineSteps?.find((s) => s.id === selectedInnerStepId);
  if (!innerStep) return null;
  return {
    capsuleStepId: selectedStep.id,
    capsuleStep: selectedStep,
    innerStepId: innerStep.id,
    innerStep,
    instancePrefix: selectedStep.outputNamespace,
  };
}

export function inlineCapsuleTraceStepLabels(steps: readonly PipelineStep[]): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const step of steps) {
    labels[step.id] = step.label;
    if (step.config.type === 'capsule-instance' && step.config.displayMode === 'inline') {
      for (const inner of step.config.inlineSteps ?? []) {
        labels[inner.id] = inner.label;
      }
    }
  }
  return labels;
}
