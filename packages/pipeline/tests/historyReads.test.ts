import {describe, it, expect} from 'vitest';
import type {PipelineStep, StepHistoryReadConfig} from '@lorca/core';
import {PIPELINE_INPUT_STEP_ID} from '@lorca/core';
import {
  getStepHistoryReads,
  getPriorSourceSteps,
  defaultArtifactRefForSource,
  validateHistoryRead,
  listStepOutputArtifacts,
} from '../src/historyReads.js';

function makeStep(id: string, label: string, overrides?: Partial<PipelineStep>): PipelineStep {
  return {
    id,
    type: 'model-call',
    label,
    enabled: true,
    outputNamespace: id.replace(/-/g, '_'),
    primaryOutputName: 'text',
    lastEditedAt: new Date().toISOString(),
    config: {
      type: 'model-call',
      modelRef: {kind: 'fixed', endpointId: 'ep', modelName: 'm'},
      mode: 'generate',
      outputNames: ['text', 'rawResponse'],
    },
    ...overrides,
  };
}

describe('getStepHistoryReads', () => {
  it('prefers prompt.historyReads over step.historyReads', () => {
    const read: StepHistoryReadConfig = {
      sourceStepId: PIPELINE_INPUT_STEP_ID,
      sourceArtifactRef: 'user_prompt.xml',
      tagName: 'user_prompt',
      required: true,
    };
    const step = makeStep('s1', 'One', {
      historyReads: [{...read, tagName: 'legacy'}],
      prompt: {
        previousOutput: {enabled: false, placement: 'afterOwnPrompt', tagName: 'previous_output'},
        historyReads: [read],
        blocks: [],
      },
    });
    expect(getStepHistoryReads(step)).toEqual([read]);
  });
});

describe('getPriorSourceSteps', () => {
  it('includes pipeline input and only prior steps', () => {
    const steps = [makeStep('a', 'A'), makeStep('b', 'B'), makeStep('c', 'C')];
    const sources = getPriorSourceSteps(steps, 'b');
    expect(sources.map((s) => s.stepId)).toEqual([PIPELINE_INPUT_STEP_ID, 'a']);
  });
});

describe('validateHistoryRead', () => {
  it('rejects reads from later steps', () => {
    const steps = [makeStep('a', 'A'), makeStep('b', 'B')];
    const read: StepHistoryReadConfig = {
      sourceStepId: 'b',
      sourceArtifactRef: 'b.text',
      tagName: 'b_out',
      required: true,
    };
    const result = validateHistoryRead(read, 'a', steps);
    expect(result.ok).toBe(false);
    expect(result.issues).toContain('source-after-self');
  });

  it('rejects reads from disabled sources', () => {
    const steps = [
      makeStep('a', 'A', {enabled: false}),
      makeStep('b', 'B'),
    ];
    const read: StepHistoryReadConfig = {
      sourceStepId: 'a',
      sourceArtifactRef: 'a.text',
      tagName: 'a_out',
      required: true,
    };
    const result = validateHistoryRead(read, 'b', steps);
    expect(result.ok).toBe(false);
    expect(result.issues).toContain('source-disabled');
  });
});

describe('listStepOutputArtifacts', () => {
  it('lists model-call outputs including primary marker', () => {
    const step = makeStep('intent', 'Intent');
    const arts = listStepOutputArtifacts(step);
    expect(arts.find((a) => a.ref === 'intent.text')?.isPrimary).toBe(true);
    expect(arts.some((a) => a.ref === 'intent.rawResponse')).toBe(true);
  });
});

describe('defaultArtifactRefForSource', () => {
  it('defaults pipeline input to user_prompt.xml', () => {
    expect(defaultArtifactRefForSource([], PIPELINE_INPUT_STEP_ID)).toBe('user_prompt.xml');
  });
});
