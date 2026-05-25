import {describe, expect, it} from 'vitest';
import type {PipelineStep} from '@lorca/core';
import {artifactRefsBeforeStep} from '../src/utils/artifactRefs.js';

function textStep(id: string, outputNamespace = id): PipelineStep {
  return {
    id,
    type: 'presentation',
    label: id,
    enabled: true,
    outputNamespace,
    primaryOutputName: 'text',
    lastEditedAt: '2026-01-01T00:00:00.000Z',
    config: {type: 'presentation', text: '', outputNames: ['text']},
  };
}

function modelStep(id: string, outputNamespace = id): PipelineStep {
  return {
    id,
    type: 'model-call',
    label: id,
    enabled: true,
    outputNamespace,
    primaryOutputName: 'text',
    lastEditedAt: '2026-01-01T00:00:00.000Z',
    config: {
      type: 'model-call',
      modelRef: {kind: 'specific', endpointId: 'ep', providerModelName: 'model'},
      mode: 'generate',
      outputType: 'auto',
    },
  };
}

describe('artifactRefsBeforeStep', () => {
  it('lists pipeline input and prior step artifacts only', () => {
    const refs = artifactRefsBeforeStep([
      textStep('intro', 'intro'),
      modelStep('answer', 'answer'),
      textStep('consumer', 'consumer'),
      textStep('later', 'later'),
    ], 'consumer');

    expect(refs).toEqual([
      'user_prompt.xml',
      'user_prompt.raw',
      'intro.text',
      'answer.text',
      'answer.rawResponse',
      'answer.json',
      'answer.jsonValid',
    ]);
  });

  it('uses the provided contextual chain for nested editors', () => {
    const refs = artifactRefsBeforeStep([
      textStep('outer', 'outer'),
      textStep('inner-a', 'inner_a'),
      textStep('inner-b', 'inner_b'),
    ], 'inner-b');

    expect(refs).toContain('outer.text');
    expect(refs).toContain('inner_a.text');
    expect(refs).not.toContain('inner_b.text');
  });
});
