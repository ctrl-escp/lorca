import {describe, it, expect} from 'vitest';
import type {PipelineStep, StepHistoryReadConfig} from '@lorca/core';
import {PIPELINE_INPUT_STEP_ID} from '@lorca/core';
import {compileActiveStepsToExecutionPlan, buildActiveStepChain} from '../src/chainCompiler.js';
import {getStepBlockReasons, validateHistoryRead} from '../src/historyReads.js';
import {
  findPreviousEnabledStep,
  findPreviousEnabledStepAt,
  resolvePreviousOutputArtifactRef,
} from '../src/stepRefs.js';

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

describe('step ref semantics on reorder', () => {
  it('previous output follows chain position, not stored refs', () => {
    let steps = [makeStep('a', 'A'), makeStep('b', 'B'), makeStep('c', 'C')];
    expect(resolvePreviousOutputArtifactRef(steps, 'c')).toBe('b.text');

    steps = [steps[0]!, steps[2]!, steps[1]!];
    expect(resolvePreviousOutputArtifactRef(steps, 'c')).toBe('a.text');

    const plan = compileActiveStepsToExecutionPlan(buildActiveStepChain(steps));
    const compiledC = plan.steps.find((s) => s.stepId === 'c');
    expect(compiledC?.previousOutputArtifactRef).toBe('a.text');
  });

  it('findPreviousEnabledStepAt skips disabled steps in display order', () => {
    const steps = [
      makeStep('a', 'A'),
      makeStep('b', 'B', {enabled: false}),
      makeStep('c', 'C'),
    ];
    expect(findPreviousEnabledStepAt(steps, 2)?.id).toBe('a');
    expect(findPreviousEnabledStep(steps, 'c')?.id).toBe('a');
  });

  it('history reads keep namespace refs but may become invalid when source moves later', () => {
    const read: StepHistoryReadConfig = {
      sourceStepId: 'b',
      sourceArtifactRef: 'b.text',
      tagName: 'b_out',
      required: true,
    };
    const stepC = {
      ...makeStep('c', 'C'),
      prompt: {
        previousOutput: {enabled: false, placement: 'afterOwnPrompt' as const, tagName: 'previous_output'},
        historyReads: [read],
        blocks: [],
      },
    };

    const ordered = [makeStep('a', 'A'), makeStep('b', 'B'), stepC];
    expect(validateHistoryRead(read, 'c', ordered).ok).toBe(true);
    expect(getStepBlockReasons(stepC, ordered)).toEqual([]);

    const reordered = [makeStep('a', 'A'), stepC, makeStep('b', 'B')];
    expect(read.sourceArtifactRef).toBe('b.text');
    expect(validateHistoryRead(read, 'c', reordered).ok).toBe(false);
    expect(validateHistoryRead(read, 'c', reordered).issues).toContain('source-after-self');
    expect(getStepBlockReasons(stepC, reordered).length).toBeGreaterThan(0);
  });

  it('capsule input bindings are namespace strings and survive reorder unchanged', () => {
    const capsuleStep: PipelineStep = {
      ...makeStep('cap', 'Capsule', {type: 'capsule-instance'}),
      type: 'capsule-instance',
      config: {
        type: 'capsule-instance',
        capsuleId: 'cap-def',
        capsuleVersion: 'v1',
        displayMode: 'opaque',
        inputBindings: {user_prompt: 'a.text', context: 'b.text'},
        outputBindings: {result: 'cap.result'},
        parameterValues: {},
        modelSlotBindings: {},
      },
    };
    const before = [makeStep('a', 'A'), makeStep('b', 'B'), capsuleStep];
    const after = [makeStep('b', 'B'), makeStep('a', 'A'), capsuleStep];

    expect(capsuleStep.config.type === 'capsule-instance' && capsuleStep.config.inputBindings).toEqual({
      user_prompt: 'a.text',
      context: 'b.text',
    });
    const moved = after[2]!;
    expect(moved.config.type === 'capsule-instance' && moved.config.inputBindings).toEqual({
      user_prompt: 'a.text',
      context: 'b.text',
    });
    expect(before[0]!.outputNamespace).toBe(after[1]!.outputNamespace);
  });

  it('pipeline-input history reads are unaffected by reorder', () => {
    const read: StepHistoryReadConfig = {
      sourceStepId: PIPELINE_INPUT_STEP_ID,
      sourceArtifactRef: 'user_prompt.xml',
      tagName: 'user_prompt',
      required: true,
    };
    const step = {
      ...makeStep('x', 'X'),
      prompt: {
        previousOutput: {enabled: false, placement: 'afterOwnPrompt' as const, tagName: 'previous_output'},
        historyReads: [read],
        blocks: [],
      },
    };
    const reordered = [step, makeStep('a', 'A'), makeStep('b', 'B')];
    expect(validateHistoryRead(read, 'x', reordered).ok).toBe(true);
  });
});
