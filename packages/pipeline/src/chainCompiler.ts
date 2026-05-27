import type {
  PipelineDefinition,
  PipelineStep,
  StepType,
} from '@lorca/core';
import {getStepHistoryReads, getStepBlockReasons} from './historyReads.js';

// ── Active chain ──────────────────────────────────────────────────────────────

export function buildActiveStepChain(steps: PipelineStep[]): PipelineStep[] {
  return steps.filter((s) => s.enabled);
}

// ── Execution plan ────────────────────────────────────────────────────────────

export interface CompiledExecutionStep {
  stepId: string;
  stepOrder: number;
  type: StepType;
  inputArtifactRefs: string[];
  historyReads?: import('@lorca/core').StepHistoryReadConfig[];
  previousOutputArtifactRef?: string;
  outputNamespace: string;
  execute: 'run' | 'skip' | 'blocked';
  blockedReason?: string;
}

export interface ExecutionPlan {
  steps: CompiledExecutionStep[];
  stopAtStepId?: string;
  requiredHistorySources: string[];
}

export interface ExecutePipelineOptions {
  stopAtStepId?: string;
  /** When set, steps before this step are compiled as 'skip' and not executed. */
  startAtStepId?: string;
  includeDisabled?: boolean;
  reuseValidArtifacts?: boolean;
  abortSignal?: AbortSignal;
  /** Pre-seeded artifacts (e.g. Capsule input port values). */
  seedArtifacts?: Record<string, import('@lorca/core').PipelineArtifact>;
  /** Parameter values available while rendering Capsule step prompts. */
  params?: Record<string, unknown>;
  /** When executing an inline capsule, start the inner chain at this step id. */
  capsuleInnerStartAtStepId?: string;
}

export function compileStepChainToExecutionPlan(
  pipeline: PipelineDefinition,
  options: ExecutePipelineOptions = {},
): ExecutionPlan {
  const activeSteps = options.includeDisabled
    ? pipeline.steps
    : buildActiveStepChain(pipeline.steps);

  const stopIdx = options.stopAtStepId
    ? activeSteps.findIndex((s) => s.id === options.stopAtStepId)
    : -1;
  const slicedSteps = stopIdx >= 0 ? activeSteps.slice(0, stopIdx + 1) : activeSteps;

  const startIdx = options.startAtStepId
    ? slicedSteps.findIndex((s) => s.id === options.startAtStepId)
    : -1;

  return compileActiveStepsToExecutionPlan(slicedSteps, {
    allSteps: pipeline.steps,
    ...(options.stopAtStepId ? {stopAtStepId: options.stopAtStepId} : {}),
    ...(startIdx > 0 ? {skipBeforeIndex: startIdx} : {}),
  });
}

/** Compile an ordered active step slice into an execution plan. */
export function compileActiveStepsToExecutionPlan(
  steps: PipelineStep[],
  options?: {stopAtStepId?: string; allSteps?: PipelineStep[]; skipBeforeIndex?: number},
): ExecutionPlan {
  const stopAtStepId = options?.stopAtStepId;
  const skipBeforeIndex = options?.skipBeforeIndex ?? 0;
  const allSteps = options?.allSteps ?? steps;
  const requiredHistorySources = new Set<string>();
  const compiled: CompiledExecutionStep[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    const prevActiveStep = i > 0 ? steps[i - 1] : undefined;

    const historyReads = getStepHistoryReads(step);
    for (const read of historyReads) {
      requiredHistorySources.add(read.sourceStepId);
    }

    const previousOutputArtifactRef = prevActiveStep
      ? `${prevActiveStep.outputNamespace}.${prevActiveStep.primaryOutputName}`
      : undefined;

    const inputArtifactRefs: string[] = [];
    if (previousOutputArtifactRef) inputArtifactRefs.push(previousOutputArtifactRef);
    for (const read of historyReads) {
      inputArtifactRefs.push(read.sourceArtifactRef);
    }

    const blockReasons = getStepBlockReasons(step, allSteps);
    const shouldSkip = i < skipBeforeIndex;
    const compiledStep: CompiledExecutionStep = {
      stepId: step.id,
      stepOrder: i,
      type: step.type,
      inputArtifactRefs,
      outputNamespace: step.outputNamespace,
      execute: shouldSkip ? 'skip' : blockReasons.length > 0 ? 'blocked' : 'run',
    };
    if (blockReasons.length > 0) compiledStep.blockedReason = blockReasons.join('; ');
    if (historyReads.length > 0) compiledStep.historyReads = historyReads;
    if (previousOutputArtifactRef !== undefined) compiledStep.previousOutputArtifactRef = previousOutputArtifactRef;
    compiled.push(compiledStep);
  }

  return {
    steps: compiled,
    ...(stopAtStepId ? {stopAtStepId} : {}),
    requiredHistorySources: [...requiredHistorySources],
  };
}

export function makeEmptyPipeline(id: string, name: string, createdAt?: string): PipelineDefinition {
  const now = createdAt ?? new Date().toISOString();
  return {
    schemaVersion: 2,
    id,
    name,
    input: {raw: '', tagName: 'user', outputNamespace: 'user_prompt'},
    steps: [],
    createdAt: now,
    updatedAt: now,
  };
}
