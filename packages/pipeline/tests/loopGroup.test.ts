import {describe, it, expect} from 'vitest';
import type {PipelineDefinition, PipelineStep, LoopExitCondition} from '@lorca/core';
import {executeStepChain} from '../src/stepExecutor.js';

function makeManualStep(id: string, text: string, ns?: string): PipelineStep {
  return {
    id,
    type: 'manual-text',
    label: id,
    enabled: true,
    outputNamespace: ns ?? id,
    primaryOutputName: 'text',
    lastEditedAt: new Date().toISOString(),
    config: {type: 'manual-text', text, outputNames: ['text']},
  };
}

function makeLoopPipeline(
  innerSteps: PipelineStep[],
  options?: {maxIterations?: number; exitCondition?: LoopExitCondition},
): PipelineDefinition {
  const maxIterations = options?.maxIterations ?? 3;
  const exitCondition = options?.exitCondition ?? {type: 'json-field-equals' as const, fieldPath: 'passed', value: true};

  return {
    schemaVersion: 2,
    id: 'pipe-loop',
    name: 'Loop test',
    input: {raw: 'hello', tagName: 'user', outputNamespace: 'user_prompt'},
    steps: [{
      id: 'loop',
      type: 'loop-group',
      label: 'Loop',
      enabled: true,
      outputNamespace: 'loop_out',
      primaryOutputName: 'text',
      lastEditedAt: new Date().toISOString(),
      config: {
        type: 'loop-group',
        maxIterations,
        exitCondition,
        steps: innerSteps,
        outputNames: ['text'],
      },
    }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('loop-group execution', () => {
  it('exits after first iteration when exit condition is met', async () => {
    const pipeline = makeLoopPipeline([
      makeManualStep('verify', JSON.stringify({passed: true})),
    ]);

    const result = await executeStepChain(pipeline, 'hello', {}, () => undefined, {
      onTraceEvent() {},
      onArtifact() {},
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.finalOutputKey).toBe('loop_out.text');
  });

  it('runs until maxIterations when exit condition is never met', async () => {
    const pipeline = makeLoopPipeline([
      makeManualStep('verify', JSON.stringify({passed: false})),
    ], {maxIterations: 2});

    const result = await executeStepChain(pipeline, 'hello', {}, () => undefined, {
      onTraceEvent() {},
      onArtifact() {},
    });

    expect(result.ok).toBe(true);
  });

  it('always runs maxIterations when exit condition type is iterations', async () => {
    const pipeline = makeLoopPipeline(
      [makeManualStep('body', 'done')],
      {maxIterations: 2, exitCondition: {type: 'iterations'}},
    );

    const result = await executeStepChain(pipeline, 'hello', {}, () => undefined, {
      onTraceEvent() {},
      onArtifact() {},
    });

    expect(result.ok).toBe(true);
  });

  it('rejects empty inner chains', async () => {
    const pipeline = makeLoopPipeline([]);

    const result = await executeStepChain(pipeline, 'hello', {}, () => undefined, {
      onTraceEvent() {},
      onArtifact() {},
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('at least one enabled inner step');
  });

  it('exposes loop.prev.text to inner steps from the second iteration onward', async () => {
    const pipeline = makeLoopPipeline([
      makeManualStep('gen', 'first-output'),
      {
        id: 'wrap',
        type: 'prompt-wrapper',
        label: 'Wrap',
        enabled: true,
        outputNamespace: 'wrap',
        primaryOutputName: 'text',
        lastEditedAt: new Date().toISOString(),
        config: {type: 'prompt-wrapper', outputNames: ['text']},
        prompt: {
          previousOutput: {enabled: false, placement: 'afterOwnPrompt', tagName: 'previous_output'},
          historyReads: [{
            sourceStepId: 'loop.prev',
            sourceArtifactRef: 'loop.prev.text',
            tagName: 'prev_iter',
            required: false,
          }],
          blocks: [{
            id: 'b1',
            label: 'Body',
            tagName: 'body',
            body: 'done',
            enabled: true,
            source: 'custom',
          }],
        },
      },
    ], {maxIterations: 2, exitCondition: {type: 'iterations'}});

    const artifacts: Record<string, import('@lorca/core').PipelineArtifact> = {};
    const result = await executeStepChain(pipeline, 'hello', {}, () => undefined, {
      onTraceEvent() {},
      onArtifact(a) { artifacts[a.name] = a; },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const out = String(artifacts['loop_out.text']?.value ?? '');
      // Iteration 2 embeds iteration 1's last-step output via loop.prev inside prev_iter.
      expect(out).toMatch(/<prev_iter>[\s\S]*<body>[\s\S]*done[\s\S]*<\/prev_iter>/);
    }
  });
});
