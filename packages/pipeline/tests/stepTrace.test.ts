import {describe, it, expect} from 'vitest';
import type {PipelineArtifact, PipelineStep} from '@lorca/core';
import {primaryOutputPreview, truncatePreview} from '../src/stepTrace.js';

function makeStep(overrides?: Partial<PipelineStep>): PipelineStep {
  return {
    id: 's1',
    type: 'presentation',
    label: 'Step',
    enabled: true,
    outputNamespace: 'ns',
    primaryOutputName: 'text',
    lastEditedAt: new Date().toISOString(),
    config: {type: 'presentation', text: 'hi', outputNames: ['text']},
    ...overrides,
  };
}

describe('stepTrace', () => {
  it('truncatePreview collapses whitespace and caps length', () => {
    expect(truncatePreview('  hello\n\nworld  ', 8)).toBe('hello wo…');
  });

  it('primaryOutputPreview reads the step primary artifact', () => {
    const step = makeStep();
    const artifacts: Record<string, PipelineArtifact> = {
      'ns.text': {
        name: 'ns.text',
        nodeId: 's1',
        kind: 'text',
        value: 'model output here',
        createdAt: new Date().toISOString(),
      },
    };
    expect(primaryOutputPreview(step, artifacts)).toBe('model output here');
  });

  it('primaryOutputPreview returns undefined when artifact is missing', () => {
    expect(primaryOutputPreview(makeStep(), {})).toBeUndefined();
  });
});
