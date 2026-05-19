import type {PipelineStep, StepHistoryReadConfig} from '@lorca/core';
import {PIPELINE_INPUT_STEP_ID} from '@lorca/core';
import {isValidTag} from '@lorca/prompt';
import {stepArtifactKey} from './artifacts.js';

function activeStepChain(steps: PipelineStep[]): PipelineStep[] {
  return steps.filter((s) => s.enabled);
}

export interface SourceStepOption {
  stepId: string;
  label: string;
  enabled: boolean;
}

export interface ArtifactOption {
  ref: string;
  label: string;
  isPrimary: boolean;
}

export type HistoryReadIssue =
  | 'source-not-found'
  | 'source-disabled'
  | 'source-after-self'
  | 'source-is-self'
  | 'invalid-tag';

export interface HistoryReadValidation {
  ok: boolean;
  issues: HistoryReadIssue[];
}

/** History reads live on prompt config; step-level field is a legacy fallback. */
export function getStepHistoryReads(step: PipelineStep): StepHistoryReadConfig[] {
  return step.prompt?.historyReads ?? step.historyReads ?? [];
}

export function listPipelineInputArtifacts(): ArtifactOption[] {
  return [
    {ref: 'user_prompt.xml', label: 'XML prompt', isPrimary: true},
    {ref: 'user_prompt.raw', label: 'Raw text', isPrimary: false},
  ];
}

export function listStepOutputArtifacts(step: PipelineStep): ArtifactOption[] {
  const {config} = step;
  const primary = step.primaryOutputName;
  const mk = (name: string, label?: string): ArtifactOption => ({
    ref: stepArtifactKey(step, name),
    label: label ?? name,
    isPrimary: name === primary,
  });

  switch (config.type) {
    case 'model-call':
      return [
        mk('text'),
        mk('rawResponse', 'raw response'),
        mk('parsedJson', 'parsed JSON (if available)'),
      ];
    case 'prompt-wrapper':
    case 'template':
    case 'manual-text':
    case 'loop-group':
      return [mk('text')];
    case 'json-extract':
      return [mk('json')];
    case 'capsule-instance':
      return Object.entries(config.outputBindings).map(([name, ref]) => ({
        ref,
        label: name,
        isPrimary: name === primary,
      }));
    default:
      return [mk(primary)];
  }
}

export function artifactsForSourceStep(
  allSteps: PipelineStep[],
  sourceStepId: string,
): ArtifactOption[] {
  if (sourceStepId === PIPELINE_INPUT_STEP_ID) return listPipelineInputArtifacts();
  const step = allSteps.find((s) => s.id === sourceStepId);
  return step ? listStepOutputArtifacts(step) : [];
}

/** Prior steps available as history sources for the given consumer step. */
export function getPriorSourceSteps(
  allSteps: PipelineStep[],
  consumerStepId: string,
): SourceStepOption[] {
  const options: SourceStepOption[] = [
    {stepId: PIPELINE_INPUT_STEP_ID, label: 'Pipeline Input', enabled: true},
  ];

  for (const step of allSteps) {
    if (step.id === consumerStepId) break;
    options.push({stepId: step.id, label: step.label, enabled: step.enabled});
  }
  return options;
}

export function defaultArtifactRefForSource(
  allSteps: PipelineStep[],
  sourceStepId: string,
): string {
  if (sourceStepId === PIPELINE_INPUT_STEP_ID) return 'user_prompt.xml';
  const step = allSteps.find((s) => s.id === sourceStepId);
  if (!step) return '';
  return stepArtifactKey(step);
}

export function suggestHistoryReadTagName(
  sourceStepId: string,
  allSteps: PipelineStep[],
): string {
  if (sourceStepId === PIPELINE_INPUT_STEP_ID) return 'user_prompt';
  const step = allSteps.find((s) => s.id === sourceStepId);
  if (!step) return 'history';
  const ns = step.outputNamespace.replace(/-/g, '_');
  return isValidTag(ns) ? ns : 'history';
}

export function validateHistoryRead(
  read: StepHistoryReadConfig,
  consumerStepId: string,
  allSteps: PipelineStep[],
): HistoryReadValidation {
  const issues: HistoryReadIssue[] = [];

  if (!isValidTag(read.tagName)) issues.push('invalid-tag');
  if (read.sourceStepId === consumerStepId) issues.push('source-is-self');

  if (read.sourceStepId === PIPELINE_INPUT_STEP_ID) {
    return {ok: issues.length === 0, issues};
  }

  const sourceStep = allSteps.find((s) => s.id === read.sourceStepId);
  if (!sourceStep) {
    issues.push('source-not-found');
    return {ok: false, issues};
  }

  if (!sourceStep.enabled) issues.push('source-disabled');

  const consumerIdx = allSteps.findIndex((s) => s.id === consumerStepId);
  const sourceIdx = allSteps.findIndex((s) => s.id === read.sourceStepId);
  if (sourceIdx < 0 || sourceIdx >= consumerIdx) issues.push('source-after-self');

  // Active-chain ordering: source must appear before consumer in the enabled chain.
  const activeChain = activeStepChain(allSteps);
  const activeConsumerIdx = activeChain.findIndex((s) => s.id === consumerStepId);
  const activeSourceIdx = activeChain.findIndex((s) => s.id === read.sourceStepId);
  if (
    activeConsumerIdx >= 0
    && read.sourceStepId !== PIPELINE_INPUT_STEP_ID
    && (activeSourceIdx < 0 || activeSourceIdx >= activeConsumerIdx)
  ) {
    if (!issues.includes('source-after-self')) issues.push('source-after-self');
  }

  return {ok: issues.length === 0, issues};
}

export function getStepBlockReasons(step: PipelineStep, allSteps: PipelineStep[]): string[] {
  if (!step.enabled) return [];
  const reasons: string[] = [];
  for (const read of getStepHistoryReads(step)) {
    if (!read.required) continue;
    const validation = validateHistoryRead(read, step.id, allSteps);
    if (!validation.ok) {
      const label = `${read.sourceArtifactRef}: ${validation.issues.map(historyReadIssueLabel).join(', ')}`;
      reasons.push(label);
    }
  }
  return reasons;
}

export function isStepBlocked(step: PipelineStep, allSteps: PipelineStep[]): boolean {
  return getStepBlockReasons(step, allSteps).length > 0;
}

export function historyReadIssueLabel(issue: HistoryReadIssue): string {
  switch (issue) {
    case 'source-not-found': return 'Source step was deleted';
    case 'source-disabled': return 'Source step is disabled';
    case 'source-after-self': return 'Source must be an earlier step';
    case 'source-is-self': return 'Cannot read from this step';
    case 'invalid-tag': return 'Invalid XML tag name';
  }
}
