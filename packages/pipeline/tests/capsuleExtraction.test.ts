import {describe, it, expect} from 'vitest';
import type {PipelineDefinition, PipelineStep} from '@lorca/core';
import {PIPELINE_INPUT_STEP_ID} from '@lorca/core';
import {
  extractStepsToCapsule,
  extractFullPipelineToCapsule,
  computeCapsuleContentSignature,
} from '../src/capsuleExtraction.js';

function makeStep(overrides: Partial<PipelineStep> & Pick<PipelineStep, 'id' | 'type'>): PipelineStep {
  const base: PipelineStep = {
    id: overrides.id,
    type: overrides.type,
    label: overrides.label ?? overrides.id,
    enabled: overrides.enabled ?? true,
    outputNamespace: overrides.outputNamespace ?? overrides.id,
    primaryOutputName: overrides.primaryOutputName ?? 'text',
    lastEditedAt: '2026-01-01T00:00:00.000Z',
    config: overrides.config ?? {type: 'presentation', text: 'x', outputNames: ['text']},
  };
  return {...base, ...overrides};
}

function makePipeline(steps: PipelineStep[]): PipelineDefinition {
  return {
    schemaVersion: 2,
    id: 'pipe-1',
    name: 'Test Pipeline',
    input: {raw: 'hello', tagName: 'user', outputNamespace: 'user_prompt'},
    steps,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('extractStepsToCapsule', () => {
  it('extracts a single step with no external deps', () => {
    const steps = [
      makeStep({id: 'a', type: 'presentation', config: {type: 'presentation', text: 'hi', outputNames: ['text']}}),
    ];
    const pipeline = makePipeline(steps);
    const result = extractStepsToCapsule({
      pipeline,
      startIndex: 0,
      endIndex: 0,
      capsuleId: 'cap-1',
      capsuleName: 'My Capsule',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.pipeline.steps).toHaveLength(1);
    expect(result.value.pipeline.steps[0]!.type).toBe('capsule-instance');
    expect(result.value.capsule.steps).toHaveLength(1);
    expect(result.value.capsule.steps![0]!.id).toBe('a');
  });

  it('creates input ports for history reads outside the selection', () => {
    const intent = makeStep({
      id: 'intent',
      type: 'presentation',
      outputNamespace: 'intent_extraction',
      config: {type: 'presentation', text: '{}', outputNames: ['text']},
    });
    const rewrite = makeStep({
      id: 'rewrite',
      type: 'presentation',
      outputNamespace: 'rewrite',
      config: {type: 'presentation', text: '', outputNames: ['text']},
      prompt: {
        previousOutput: {enabled: false, placement: 'beforeOwnPrompt', tagName: 'prev'},
        historyReads: [{
          sourceStepId: 'intent',
          sourceArtifactRef: 'intent_extraction.text',
          tagName: 'intent',
          required: true,
        }],
        blocks: [],
      },
    });
    const pipeline = makePipeline([intent, rewrite]);
    const result = extractStepsToCapsule({
      pipeline,
      startIndex: 1,
      endIndex: 1,
      capsuleId: 'cap-2',
      capsuleName: 'Rewrite Capsule',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.capsule.interface.inputs.some((p) => p.name === 'intent_extraction')).toBe(true);
    expect(result.value.instanceStep.config.type).toBe('capsule-instance');
    if (result.value.instanceStep.config.type === 'capsule-instance') {
      expect(result.value.instanceStep.config.inputBindings.intent_extraction).toBe('intent_extraction.text');
    }
    const inner = result.value.capsule.steps![0]!;
    const reads = inner.prompt?.historyReads ?? [];
    expect(reads[0]?.sourceStepId).toBe(PIPELINE_INPUT_STEP_ID);
  });

  it('rejects loop-group extraction', () => {
    const loop = makeStep({
      id: 'loop',
      type: 'loop-group',
      config: {
        type: 'loop-group',
        maxIterations: 2,
        exitCondition: {type: 'iterations'},
        steps: [],
        outputNames: ['text'],
      },
    });
    const pipeline = makePipeline([loop]);
    const result = extractStepsToCapsule({
      pipeline,
      startIndex: 0,
      endIndex: 0,
      capsuleId: 'cap-3',
      capsuleName: 'Loop',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('nested_loop');
  });
});

describe('extractFullPipelineToCapsule', () => {
  it('replaces all steps with one instance', () => {
    const pipeline = makePipeline([
      makeStep({id: 'a', type: 'presentation', config: {type: 'presentation', text: 'a', outputNames: ['text']}}),
      makeStep({id: 'b', type: 'presentation', config: {type: 'presentation', text: 'b', outputNames: ['text']}}),
    ]);
    const result = extractFullPipelineToCapsule(pipeline, 'cap-full', 'Full');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.pipeline.steps).toHaveLength(1);
    expect(result.value.capsule.steps).toHaveLength(2);
  });
});

describe('computeCapsuleContentSignature', () => {
  it('changes when capsule steps change', () => {
    const pipeline = makePipeline([
      makeStep({id: 'a', type: 'presentation', config: {type: 'presentation', text: 'v1', outputNames: ['text']}}),
    ]);
    const r1 = extractFullPipelineToCapsule(pipeline, 'cap-sig', 'Sig');
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    const sig1 = computeCapsuleContentSignature(r1.value.capsule);
    const edited = {
      ...r1.value.capsule,
      steps: [{...r1.value.capsule.steps![0]!, config: {type: 'presentation' as const, text: 'v2', outputNames: ['text'] as const}}],
    };
    const sig2 = computeCapsuleContentSignature(edited);
    expect(sig1).not.toBe(sig2);
  });
});
