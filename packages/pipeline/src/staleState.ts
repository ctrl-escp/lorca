import type {
  CapsuleDefinition,
  PipelineDefinition,
  PipelineStep,
  StepRunSnapshot,
} from '@lorca/core';
import {PIPELINE_INPUT_STEP_ID} from '@lorca/core';
import type {CompiledExecutionStep} from './chainCompiler.js';
import {buildActiveStepChain} from './chainCompiler.js';
import {computeCapsuleContentSignature} from './capsuleExtraction.js';
import {getStepHistoryReads, getStepBlockReasons} from './historyReads.js';

export type CapsuleSignatureResolver = (capsuleId: string, version: string) => CapsuleDefinition | undefined;

function stableHash(value: unknown): string {
  const json = JSON.stringify(value, (_key, val) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(val as Record<string, unknown>).sort()) {
        sorted[k] = (val as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return val;
  });
  let h = 5381;
  for (let i = 0; i < json.length; i++) h = ((h << 5) + h) ^ json.charCodeAt(i);
  return (h >>> 0).toString(36);
}

export function computeUserPromptSignature(raw: string): string {
  return stableHash({userPrompt: raw});
}

export function computeStepConfigSignature(step: PipelineStep): string {
  return stableHash({
    type: step.type,
    config: step.config,
    prompt: step.prompt,
    enabled: step.enabled,
    outputNamespace: step.outputNamespace,
    primaryOutputName: step.primaryOutputName,
  });
}

export function computeStepInputSignature(step: PipelineStep, allSteps: PipelineStep[]): string {
  const activeSteps = buildActiveStepChain(allSteps);
  const idx = activeSteps.findIndex((s) => s.id === step.id);
  const prev = idx > 0 ? activeSteps[idx - 1] : undefined;
  const historyReads = getStepHistoryReads(step)
    .map((r) => ({...r}))
    .sort((a, b) => a.sourceArtifactRef.localeCompare(b.sourceArtifactRef));

  return stableHash({
    previousOutput: prev ? `${prev.outputNamespace}.${prev.primaryOutputName}` : null,
    historyReads,
  });
}

export function computeHistoryReadSignatures(
  step: PipelineStep,
  pipeline: PipelineDefinition,
  userPromptSignature: string,
): Record<string, string> {
  const sigs: Record<string, string> = {};
  for (const read of getStepHistoryReads(step)) {
    if (read.sourceStepId === PIPELINE_INPUT_STEP_ID) {
      sigs[read.sourceArtifactRef] = userPromptSignature;
    } else {
      const source = pipeline.steps.find((s) => s.id === read.sourceStepId);
      sigs[read.sourceArtifactRef] = source ? computeStepConfigSignature(source) : 'missing';
    }
  }
  return sigs;
}

export function buildStepRunSnapshot(
  step: PipelineStep,
  compiledStep: CompiledExecutionStep,
  pipeline: PipelineDefinition,
  userPromptSignature: string,
  outputArtifactRefs: string[],
  status: StepRunSnapshot['status'],
): StepRunSnapshot {
  return {
    stepId: step.id,
    inputSignature: computeStepInputSignature(step, pipeline.steps),
    configSignature: computeStepConfigSignature(step),
    historyReadSignatures: computeHistoryReadSignatures(step, pipeline, userPromptSignature),
    outputArtifactRefs,
    completedAt: new Date().toISOString(),
    status,
  };
}

export type StepRunUiState =
  | 'not-run'
  | 'current'
  | 'stale'
  | 'failed-current'
  | 'failed-stale'
  | 'disabled'
  | 'skipped-partial'
  | 'blocked';

export interface StepStaleState {
  stepId: string;
  state: StepRunUiState;
  blockReasons?: string[];
}

export interface RunSnapshotContext {
  snapshots: Record<string, StepRunSnapshot>;
  userPromptSignature: string;
  partial: boolean;
  executedStepIds: string[];
}

function isCapsuleDefinitionStale(
  step: PipelineStep,
  resolveCapsule?: CapsuleSignatureResolver,
): boolean {
  if (step.config.type !== 'capsule-instance') return false;
  const bound = step.config.boundContentSignature;
  if (!bound || !resolveCapsule) return false;
  const capsule = resolveCapsule(step.config.capsuleId, step.config.capsuleVersion);
  if (!capsule) return true;
  return computeCapsuleContentSignature(capsule) !== bound;
}

function isDirectlyStale(
  step: PipelineStep,
  snapshot: StepRunSnapshot,
  pipeline: PipelineDefinition,
  userPromptRaw: string,
  runUserPromptSignature: string,
  resolveCapsule?: CapsuleSignatureResolver,
): boolean {
  const userSig = computeUserPromptSignature(userPromptRaw);
  if (userSig !== runUserPromptSignature) return true;

  if (isCapsuleDefinitionStale(step, resolveCapsule)) return true;

  const configSig = computeStepConfigSignature(step);
  if (configSig !== snapshot.configSignature) return true;

  const inputSig = computeStepInputSignature(step, pipeline.steps);
  if (inputSig !== snapshot.inputSignature) return true;

  const currentHistory = computeHistoryReadSignatures(step, pipeline, userSig);
  for (const [ref, sig] of Object.entries(currentHistory)) {
    if (snapshot.historyReadSignatures[ref] !== sig) return true;
  }
  for (const ref of Object.keys(snapshot.historyReadSignatures)) {
    if (!(ref in currentHistory)) return true;
  }

  return false;
}

/** Derive per-step UI run/stale state from the last run snapshot and current pipeline. */
export function computeStepStaleStates(
  pipeline: PipelineDefinition,
  runContext: RunSnapshotContext | null,
  userPromptRaw: string,
  resolveCapsule?: CapsuleSignatureResolver,
): StepStaleState[] {
  if (!runContext) {
    return pipeline.steps.map((step) => {
      if (!step.enabled) return {stepId: step.id, state: 'disabled'};
      const blockReasons = getStepBlockReasons(step, pipeline.steps);
      if (blockReasons.length > 0) {
        return {stepId: step.id, state: 'blocked', blockReasons};
      }
      return {stepId: step.id, state: step.enabled ? 'not-run' : 'disabled'};
    });
  }

  const {snapshots, userPromptSignature, partial, executedStepIds} = runContext;
  const activeSteps = buildActiveStepChain(pipeline.steps);
  const executedSet = new Set(executedStepIds);

  const directlyStale = new Map<string, boolean>();
  for (const step of pipeline.steps) {
    const snapshot = snapshots[step.id];
    directlyStale.set(
      step.id,
      snapshot
        ? isDirectlyStale(step, snapshot, pipeline, userPromptRaw, userPromptSignature, resolveCapsule)
        : isCapsuleDefinitionStale(step, resolveCapsule),
    );
  }

  let chainStaleFrom: number | null = null;
  for (let i = 0; i < activeSteps.length; i++) {
    const step = activeSteps[i]!;
    if (directlyStale.get(step.id)) {
      chainStaleFrom = chainStaleFrom ?? i;
    }
  }

  return pipeline.steps.map((step) => {
    if (!step.enabled) return {stepId: step.id, state: 'disabled'};

    const blockReasons = getStepBlockReasons(step, pipeline.steps);
    if (blockReasons.length > 0) {
      return {stepId: step.id, state: 'blocked', blockReasons};
    }

    if (partial && !executedSet.has(step.id)) {
      return {stepId: step.id, state: 'skipped-partial'};
    }

    const snapshot = snapshots[step.id];
    if (!snapshot) return {stepId: step.id, state: 'not-run'};

    const activeIdx = activeSteps.findIndex((s) => s.id === step.id);
    const staleByChain = chainStaleFrom !== null && activeIdx >= 0 && activeIdx >= chainStaleFrom;
    const stale = directlyStale.get(step.id) || staleByChain;

    if (snapshot.status === 'failed') {
      return {stepId: step.id, state: stale ? 'failed-stale' : 'failed-current'};
    }

    return {stepId: step.id, state: stale ? 'stale' : 'current'};
  });
}

export function stepRunUiStateLabel(state: StepRunUiState): string {
  switch (state) {
    case 'not-run': return 'Not run';
    case 'current': return 'Current';
    case 'stale': return 'Stale';
    case 'failed-current': return 'Failed';
    case 'failed-stale': return 'Failed (stale)';
    case 'disabled': return 'Disabled';
    case 'skipped-partial': return 'Skipped';
    case 'blocked': return 'Blocked';
  }
}
