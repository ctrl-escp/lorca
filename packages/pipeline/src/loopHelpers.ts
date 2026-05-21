import type {LoopExitCondition, PipelineStep, PromptBlock} from '@lorca/core';
import {LOOP_PREV_ARTIFACT_REF} from '@lorca/core';

const RETRY_FEEDBACK_TAG = 'retry_feedback';
const RETRY_FEEDBACK_BODY = `The previous attempt did not pass verification. Use the feedback in <${RETRY_FEEDBACK_TAG}> to improve your output. Do not repeat the same mistakes.`;

/** Infer a loop exit condition from the last inner step (usually a verifier). */
export function inferLoopExitCondition(lastStep: PipelineStep): LoopExitCondition {
  const sid = lastStep.createdFromSuggestionId;
  if (sid === 'suggestion-answer-verification') {
    return {type: 'json-field-equals', fieldPath: 'passed', value: true};
  }
  if (sid === 'suggestion-drift-check') {
    return {type: 'json-field-equals', fieldPath: 'drifted', value: false};
  }

  const label = lastStep.label.toLowerCase();
  if (label.includes('verif')) {
    return {type: 'json-field-equals', fieldPath: 'passed', value: true};
  }
  if (label.includes('drift')) {
    return {type: 'json-field-equals', fieldPath: 'drifted', value: false};
  }

  return {type: 'json-field-equals', fieldPath: 'passed', value: true};
}

export function formatLoopExitSummary(exit: LoopExitCondition): string {
  if (exit.type === 'iterations') return 'Run all iterations';
  const valueLabel = typeof exit.value === 'string' ? `"${exit.value}"` : String(exit.value);
  return `Exit when \`${exit.fieldPath}\` = ${valueLabel}`;
}

export function loopExitPresetLabel(exit: LoopExitCondition): string | null {
  if (exit.type === 'iterations') return 'Run all iterations';
  if (exit.fieldPath === 'passed' && exit.value === true) return 'Verification passed';
  if (exit.fieldPath === 'drifted' && exit.value === false) return 'No drift detected';
  return null;
}

export const LOOP_EXIT_PRESETS: {
  id: string;
  label: string;
  description: string;
  exit: LoopExitCondition;
}[] = [
  {
    id: 'verify-passed',
    label: 'Verification passed',
    description: 'Last step JSON has `{ "passed": true }` (Answer Verification)',
    exit: {type: 'json-field-equals', fieldPath: 'passed', value: true},
  },
  {
    id: 'no-drift',
    label: 'No drift detected',
    description: 'Last step JSON has `{ "drifted": false }` (Drift Check)',
    exit: {type: 'json-field-equals', fieldPath: 'drifted', value: false},
  },
  {
    id: 'max-only',
    label: 'Run all iterations',
    description: 'Always run the maximum number of iterations',
    exit: {type: 'iterations'},
  },
];

function newBlockId(): string {
  return `block_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/** Wire loop.prev + retry instructions into a refine/generate step inside a loop. */
export function wireRetryFeedback(step: PipelineStep): PipelineStep {
  if (step.type !== 'model-call' && step.type !== 'prompt-wrapper') return step;

  const prompt = step.prompt ?? {
    previousOutput: {enabled: true, placement: 'afterOwnPrompt' as const, tagName: 'previous_output'},
    historyReads: [],
    blocks: [],
  };

  const hasLoopPrev = prompt.historyReads.some((r) => r.sourceArtifactRef === LOOP_PREV_ARTIFACT_REF);
  const historyReads = hasLoopPrev
    ? prompt.historyReads
    : [
      ...prompt.historyReads,
      {
        sourceStepId: 'loop.prev',
        sourceArtifactRef: LOOP_PREV_ARTIFACT_REF,
        tagName: RETRY_FEEDBACK_TAG,
        required: false,
      },
    ];

  const hasFeedbackBlock = prompt.blocks.some((b) =>
    b.body.includes(RETRY_FEEDBACK_TAG) || b.body.includes('previous attempt'),
  );

  let blocks: PromptBlock[] = prompt.blocks;
  if (!hasFeedbackBlock) {
    const feedbackBlock: PromptBlock = {
      id: newBlockId(),
      label: 'Retry feedback',
      tagName: 'system',
      body: RETRY_FEEDBACK_BODY,
      enabled: true,
      source: 'system-default',
    };
    blocks = [feedbackBlock, ...prompt.blocks];
  }

  return {
    ...step,
    prompt: {...prompt, historyReads, blocks},
  };
}

/** Apply retry feedback wiring to the first model-call in an inner chain. */
export function wireRetryFeedbackOnFirstModelCall(innerSteps: PipelineStep[]): PipelineStep[] {
  const idx = innerSteps.findIndex((s) => s.type === 'model-call' && s.enabled);
  if (idx < 0) return innerSteps;
  return innerSteps.map((s, i) => (i === idx ? wireRetryFeedback(s) : s));
}
