import type {PipelineStep} from '@lorca/core';
import {buildActiveStepChain} from './chainCompiler.js';

export type StepDataSourceRefKind = 'previous' | 'history' | 'template' | 'binding';

/** How each input reference type behaves when steps are reordered. */
export const REORDER_REF_HINTS: Record<StepDataSourceRefKind, string> = {
  previous:
    'Positional — always the nearest enabled step above this one. Reordering changes which step feeds this input.',
  history:
    'Bound to a specific step and artifact namespace. Reordering is safe while the source stays above this step.',
  template:
    'Uses artifact namespace strings (e.g. answer.text). Stable when steps are reordered.',
  binding:
    'Uses artifact namespace strings. Stable when steps are reordered.',
};

/** Nearest enabled step before `consumerIndex` in the ordered step list. */
export function findPreviousEnabledStepAt(steps: PipelineStep[], consumerIndex: number): PipelineStep | null {
  for (let i = consumerIndex - 1; i >= 0; i--) {
    const step = steps[i];
    if (step?.enabled) return step;
  }
  return null;
}

/** Nearest enabled step before the consumer in the active (enabled-only) chain. */
export function findPreviousEnabledStep(steps: PipelineStep[], consumerStepId: string): PipelineStep | null {
  const active = buildActiveStepChain(steps);
  const idx = active.findIndex((s) => s.id === consumerStepId);
  if (idx <= 0) return null;
  return active[idx - 1] ?? null;
}

/** Artifact ref for the previous-output input of a step (or pipeline input when first). */
export function resolvePreviousOutputArtifactRef(steps: PipelineStep[], consumerStepId: string): string {
  const prev = findPreviousEnabledStep(steps, consumerStepId);
  return prev ? `${prev.outputNamespace}.${prev.primaryOutputName}` : 'user_prompt.xml';
}

export function dataSourceBadgeTitle(
  kind: StepDataSourceRefKind,
  detail: string,
  artifactRef: string,
  options?: {validationMessage?: string},
): string {
  const base = `${detail}: ${artifactRef}`;
  const hint = REORDER_REF_HINTS[kind];
  if (options?.validationMessage) return `${base} — ${options.validationMessage}. ${hint}`;
  return `${base}. ${hint}`;
}
