import {describe, it, expect} from 'vitest';
import type {PipelineStep} from '@lorca/core';
import {
  inferLoopExitCondition,
  formatLoopExitSummary,
  wireRetryFeedback,
  wireRetryFeedbackOnFirstModelCall,
} from '../src/loopHelpers.js';

function stubStep(overrides: Partial<PipelineStep> & Pick<PipelineStep, 'label'>): PipelineStep {
  return {
    id: 's1',
    type: 'model-call',
    enabled: true,
    outputNamespace: 'test',
    primaryOutputName: 'text',
    lastEditedAt: new Date().toISOString(),
    config: {
      type: 'model-call',
      modelRef: {kind: 'fixed', endpointId: '', modelName: ''},
      mode: 'generate',
      outputNames: ['text', 'rawResponse'],
    },
    ...overrides,
  };
}

describe('inferLoopExitCondition', () => {
  it('detects answer verification', () => {
    const exit = inferLoopExitCondition(stubStep({
      label: 'Verify',
      createdFromSuggestionId: 'suggestion-answer-verification',
    }));
    expect(exit).toEqual({type: 'json-field-equals', fieldPath: 'passed', value: true});
  });

  it('detects drift check', () => {
    const exit = inferLoopExitCondition(stubStep({
      label: 'Drift',
      createdFromSuggestionId: 'suggestion-drift-check',
    }));
    expect(exit).toEqual({type: 'json-field-equals', fieldPath: 'drifted', value: false});
  });
});

describe('formatLoopExitSummary', () => {
  it('formats json-field-equals', () => {
    expect(formatLoopExitSummary({type: 'json-field-equals', fieldPath: 'passed', value: true}))
      .toContain('passed');
  });
});

describe('wireRetryFeedback', () => {
  it('adds loop.prev history read and feedback block', () => {
    const step = stubStep({label: 'Refine'});
    const wired = wireRetryFeedback(step);
    expect(wired.prompt?.historyReads.some((r) => r.sourceArtifactRef === 'loop.prev.text')).toBe(true);
    expect(wired.prompt?.blocks.some((b) => b.body.includes('retry_feedback'))).toBe(true);
  });

  it('does not duplicate wiring', () => {
    const once = wireRetryFeedback(stubStep({label: 'Refine'}));
    const twice = wireRetryFeedback(once);
    expect(twice.prompt?.historyReads.filter((r) => r.sourceArtifactRef === 'loop.prev.text')).toHaveLength(1);
  });
});

describe('wireRetryFeedbackOnFirstModelCall', () => {
  it('wires only the first enabled model-call', () => {
    const inner = [
      stubStep({id: 'a', label: 'Verify', type: 'presentation', config: {type: 'presentation', text: '{}', outputNames: ['text']}}),
      stubStep({id: 'b', label: 'Generate'}),
    ];
    const result = wireRetryFeedbackOnFirstModelCall(inner);
    expect(result[1]?.prompt?.historyReads.some((r) => r.sourceArtifactRef === 'loop.prev.text')).toBe(true);
    expect(result[0]?.prompt).toBeUndefined();
  });
});
