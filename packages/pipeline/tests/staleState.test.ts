import {describe, it, expect} from 'vitest';
import type {CapsuleDefinition, PipelineDefinition, PipelineStep, StepRunSnapshot} from '@lorca/core';
import {
  computeStepConfigSignature,
  computeStepInputSignature,
  computeHistoryReadSignatures,
  computeStepStaleStates,
  computeUserPromptSignature,
} from '../src/staleState.js';
import {computeCapsuleContentSignature} from '../src/capsuleExtraction.js';

function makeStep(id: string, label: string, overrides?: Partial<PipelineStep>): PipelineStep {
  return {
    id,
    type: 'presentation',
    label,
    enabled: true,
    outputNamespace: id,
    primaryOutputName: 'text',
    lastEditedAt: new Date().toISOString(),
    config: {type: 'presentation', text: label, outputNames: ['text']},
    ...overrides,
  };
}

function makePipeline(steps: PipelineStep[]): PipelineDefinition {
  return {
    schemaVersion: 2,
    id: 'p',
    name: 'Test',
    input: {raw: 'prompt', tagName: 'user', outputNamespace: 'user_prompt'},
    steps,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function snapshotFor(step: PipelineStep, pipeline: PipelineDefinition, userSig: string): StepRunSnapshot {
  return {
    stepId: step.id,
    inputSignature: computeStepInputSignature(step, pipeline.steps),
    configSignature: computeStepConfigSignature(step),
    historyReadSignatures: computeHistoryReadSignatures(step, pipeline, userSig),
    outputArtifactRefs: [`${step.outputNamespace}.text`],
    completedAt: new Date().toISOString(),
    status: 'completed',
  };
}

function makeCapsule(text: string): CapsuleDefinition {
  return {
    schemaVersion: 2,
    id: 'cap',
    name: 'Capsule',
    version: 'v1',
    status: 'locked',
    interface: {
      inputs: [],
      outputs: [{name: 'result', kind: 'text', sourceArtifactKey: 'body.text'}],
      parameters: [],
      modelSlots: [],
    },
    steps: [makeStep('body', text, {outputNamespace: 'body'})],
    tests: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeCapsuleInstance(capsule: CapsuleDefinition, overrides?: Partial<PipelineStep>): PipelineStep {
  return makeStep('inst', 'Capsule', {
    type: 'capsule-instance',
    outputNamespace: 'cap',
    config: {
      type: 'capsule-instance',
      capsuleId: capsule.id,
      capsuleVersion: capsule.version,
      inputBindings: {},
      outputBindings: {result: 'cap.text'},
      boundContentSignature: computeCapsuleContentSignature(capsule),
    },
    ...overrides,
  });
}

describe('computeStepStaleStates', () => {
  it('marks all steps not-run when there is no run context', () => {
    const pipeline = makePipeline([makeStep('a', 'A'), makeStep('b', 'B')]);
    const states = computeStepStaleStates(pipeline, null, 'prompt');
    expect(states.every((s) => s.state === 'not-run')).toBe(true);
  });

  it('marks downstream steps stale when an upstream step config changes', () => {
    const stepA = makeStep('a', 'A');
    const stepB = makeStep('b', 'B');
    const pipeline = makePipeline([stepA, stepB]);
    const userSig = computeUserPromptSignature('prompt');
    const runContext = {
      snapshots: {
        a: snapshotFor(stepA, pipeline, userSig),
        b: snapshotFor(stepB, pipeline, userSig),
      },
      userPromptSignature: userSig,
      partial: false,
      executedStepIds: ['a', 'b'],
    };

    const before = computeStepStaleStates(pipeline, runContext, 'prompt');
    expect(before.find((s) => s.stepId === 'a')?.state).toBe('current');
    expect(before.find((s) => s.stepId === 'b')?.state).toBe('current');

    stepA.config = {...stepA.config, text: 'changed'} as typeof stepA.config;
    const afterEdit = computeStepStaleStates(pipeline, runContext, 'prompt');
    expect(afterEdit.find((s) => s.stepId === 'a')?.state).toBe('stale');
    expect(afterEdit.find((s) => s.stepId === 'b')?.state).toBe('stale');
  });

  it('marks all executed steps stale when user prompt changes', () => {
    const stepA = makeStep('a', 'A');
    const pipeline = makePipeline([stepA]);
    const oldSig = computeUserPromptSignature('old prompt');
    const snap = snapshotFor(stepA, pipeline, oldSig);

    const states = computeStepStaleStates(
      pipeline,
      {
        snapshots: {a: snap},
        userPromptSignature: oldSig,
        partial: false,
        executedStepIds: ['a'],
      },
      'new prompt',
    );
    expect(states.find((s) => s.stepId === 'a')?.state).toBe('stale');
  });

  it('marks steps blocked when required history reads are unresolved', () => {
    const source = makeStep('a', 'A', {enabled: false});
    const consumer: PipelineStep = {
      ...makeStep('b', 'B'),
      prompt: {
        previousOutput: {enabled: false, placement: 'afterOwnPrompt', tagName: 'previous_output'},
        historyReads: [{
          sourceStepId: 'a',
          sourceArtifactRef: 'a.text',
          tagName: 'a_out',
          required: true,
        }],
        blocks: [],
      },
    };
    const pipeline = makePipeline([source, consumer]);
    const states = computeStepStaleStates(pipeline, null, 'prompt');
    const b = states.find((s) => s.stepId === 'b');
    expect(b?.state).toBe('blocked');
    expect(b?.blockReasons?.length).toBeGreaterThan(0);
  });

  it('marks non-executed steps as skipped-partial on partial runs', () => {
    const stepA = makeStep('a', 'A');
    const stepB = makeStep('b', 'B');
    const pipeline = makePipeline([stepA, stepB]);
    const userSig = computeUserPromptSignature('prompt');

    const states = computeStepStaleStates(
      pipeline,
      {
        snapshots: {a: snapshotFor(stepA, pipeline, userSig)},
        userPromptSignature: userSig,
        partial: true,
        executedStepIds: ['a'],
      },
      'prompt',
    );
    expect(states.find((s) => s.stepId === 'a')?.state).toBe('current');
    expect(states.find((s) => s.stepId === 'b')?.state).toBe('skipped-partial');
  });

  it('marks opaque capsule stale when the saved source changes', () => {
    const capsule = makeCapsule('old');
    const changed = makeCapsule('new');
    const instance = makeCapsuleInstance(capsule);
    const pipeline = makePipeline([instance]);
    const userSig = computeUserPromptSignature('prompt');

    const states = computeStepStaleStates(
      pipeline,
      {
        snapshots: {inst: snapshotFor(instance, pipeline, userSig)},
        userPromptSignature: userSig,
        partial: false,
        executedStepIds: ['inst'],
      },
      'prompt',
      () => changed,
    );

    const state = states.find((s) => s.stepId === 'inst');
    expect(state?.state).toBe('stale');
    expect(state?.capsuleSourceChanged).toBe(true);
  });

  it('does not stale inline capsules solely because the saved source changes', () => {
    const capsule = makeCapsule('old');
    const changed = makeCapsule('new');
    const instance = makeCapsuleInstance(capsule, {
      config: {
        type: 'capsule-instance',
        capsuleId: capsule.id,
        capsuleVersion: capsule.version,
        inputBindings: {},
        outputBindings: {result: 'cap.text'},
        boundContentSignature: computeCapsuleContentSignature(capsule),
        displayMode: 'inline',
        inlineSteps: capsule.steps ?? [],
      },
    });
    const pipeline = makePipeline([instance]);
    const userSig = computeUserPromptSignature('prompt');

    const states = computeStepStaleStates(
      pipeline,
      {
        snapshots: {inst: snapshotFor(instance, pipeline, userSig)},
        userPromptSignature: userSig,
        partial: false,
        executedStepIds: ['inst'],
      },
      'prompt',
      () => changed,
    );

    const state = states.find((s) => s.stepId === 'inst');
    expect(state?.state).toBe('current');
    expect(state?.capsuleSourceChanged).toBe(true);
  });
});
