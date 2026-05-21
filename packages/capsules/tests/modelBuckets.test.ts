// @vitest-environment node
import {describe, it, expect} from 'vitest';
import type {PipelineStep} from '@lorca/core';
import {resolveModelCallSuggestedBuckets} from '../src/suggestions/modelBuckets.js';

function modelCallStep(overrides: Partial<PipelineStep> = {}): PipelineStep {
  return {
    id: 's1',
    type: 'model-call',
    label: 'Intent Extraction',
    enabled: true,
    outputNamespace: 'intent_extraction',
    primaryOutputName: 'text',
    lastEditedAt: '2026-01-01T00:00:00Z',
    config: {
      type: 'model-call',
      modelRef: {kind: 'fixed', endpointId: 'ep', modelName: 'm'},
      mode: 'generate',
      outputNames: ['text', 'rawResponse'],
    },
    ...overrides,
  };
}

describe('resolveModelCallSuggestedBuckets', () => {
  it('uses suggestion id when present', () => {
    const step = modelCallStep({
      label: 'Custom',
      createdFromSuggestionId: 'suggestion-answer-verification',
    });
    expect(resolveModelCallSuggestedBuckets(step)).toEqual(['verify']);
  });

  it('matches builtin step labels', () => {
    expect(resolveModelCallSuggestedBuckets(modelCallStep())).toEqual(['extract-json']);
    expect(
      resolveModelCallSuggestedBuckets(modelCallStep({label: 'Drift Check'})),
    ).toEqual(['verify']);
  });

  it('falls back to general for unknown labels', () => {
    expect(
      resolveModelCallSuggestedBuckets(modelCallStep({label: 'My Custom Step'})),
    ).toEqual(['general']);
  });
});
