import type {PipelineStep} from '@lorca/core';
import type {PipelineSuggestion} from './types.js';
import {SUGGESTION_CANDIDATE_ANSWER, SUGGESTION_ANSWER_VERIFICATION} from './definitions.js';
import {SUGGESTION_PROMPT_REWRITE, SUGGESTION_DRIFT_CHECK} from './definitions.js';
import {wireRetryFeedbackOnFirstModelCall} from '@lorca/pipeline';

function cloneStep(step: PipelineStep, nsSuffix: string): PipelineStep {
  return {
    ...JSON.parse(JSON.stringify(step)) as PipelineStep,
    id: `${step.id}-inner-${nsSuffix}`,
    outputNamespace: `${step.outputNamespace}_loop`,
    lastEditedAt: new Date().toISOString(),
  };
}

function makeRetryLoopSuggestion(
  base: Omit<PipelineSuggestion, 'insertableSteps'>,
  refineStep: PipelineStep,
  verifyStep: PipelineStep,
  exitField: 'passed' | 'drifted',
): PipelineSuggestion {
  const innerRaw = [refineStep, verifyStep];
  const inner = wireRetryFeedbackOnFirstModelCall(innerRaw);
  const loopStep: PipelineStep = {
    id: base.id.replace('suggestion-', 'loop-'),
    type: 'loop-group',
    label: base.name,
    enabled: true,
    outputNamespace: base.id.replace('suggestion-', '').replace(/-/g, '_'),
    primaryOutputName: 'text',
    lastEditedAt: new Date().toISOString(),
    createdFromSuggestionId: base.id,
    config: {
      type: 'loop-group',
      maxIterations: 3,
      exitCondition: exitField === 'passed'
        ? {type: 'json-field-equals', fieldPath: 'passed', value: true}
        : {type: 'json-field-equals', fieldPath: 'drifted', value: false},
      steps: inner,
      outputNames: ['text'],
    },
  };

  return {
    ...base,
    description: `${base.description} Wrapped in a retry loop (refine → verify, up to 3×).`,
    insertableSteps: [loopStep],
  };
}

export const SUGGESTION_RETRY_UNTIL_VERIFIED: PipelineSuggestion = makeRetryLoopSuggestion(
  {
    id: 'suggestion-retry-until-verified',
    name: 'Retry until verified',
    description: 'Generate a candidate answer, verify it, and retry with feedback until it passes or max iterations.',
    category: 'verification',
    preferredModelBucket: 'verify',
    requiredBindings: [],
    outputHints: [{stepId: 'verify', outputName: 'text', description: 'Final verification JSON from last iteration'}],
  },
  cloneStep(SUGGESTION_CANDIDATE_ANSWER.insertableSteps[0]!, 'gen'),
  cloneStep(SUGGESTION_ANSWER_VERIFICATION.insertableSteps[0]!, 'verify'),
  'passed',
);

export const SUGGESTION_RETRY_UNTIL_NO_DRIFT: PipelineSuggestion = makeRetryLoopSuggestion(
  {
    id: 'suggestion-retry-until-no-drift',
    name: 'Retry until no drift',
    description: 'Rewrite output, check for drift, and retry with feedback until aligned or max iterations.',
    category: 'verification',
    preferredModelBucket: 'verify',
    requiredBindings: [],
    outputHints: [{stepId: 'drift', outputName: 'text', description: 'Final drift check JSON from last iteration'}],
  },
  cloneStep(SUGGESTION_PROMPT_REWRITE.insertableSteps[0]!, 'rewrite'),
  cloneStep(SUGGESTION_DRIFT_CHECK.insertableSteps[0]!, 'drift'),
  'drifted',
);

export const RETRY_LOOP_SUGGESTIONS: PipelineSuggestion[] = [
  SUGGESTION_RETRY_UNTIL_VERIFIED,
  SUGGESTION_RETRY_UNTIL_NO_DRIFT,
];
