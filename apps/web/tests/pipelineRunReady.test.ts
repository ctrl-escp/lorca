import {describe, it, expect} from 'vitest';
import type {CapsuleDefinition, PipelineDefinition, PipelineStep} from '@lorca/core';
import {
  isCapsuleInstanceRunReady,
  pipelineStepChainRunReady,
} from '../src/utils/pipelineRunReady.js';

function makePipeline(steps: PipelineStep[], inputRaw = 'hello'): PipelineDefinition {
  return {
    schemaVersion: 2,
    id: 'pipe-1',
    name: 'Test',
    input: {raw: inputRaw, tagName: 'user', outputNamespace: 'user_prompt'},
    steps,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  };
}

function makeCapsule(overrides: Partial<CapsuleDefinition> = {}): CapsuleDefinition {
  return {
    schemaVersion: 1,
    id: 'cap-1',
    name: 'Test Capsule',
    version: 'v1',
    status: 'locked',
    interface: {inputs: [], outputs: [], parameters: [], modelSlots: []},
    steps: [],
    tests: [],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('pipelineStepChainRunReady', () => {
  it('requires a non-empty prompt', () => {
    const def = makePipeline([]);
    expect(pipelineStepChainRunReady(def, '')).toBe(false);
    expect(pipelineStepChainRunReady(def, '   ')).toBe(false);
  });

  it('allows a configured model-call step', () => {
    const def = makePipeline([{
      id: 'm1',
      type: 'model-call',
      label: 'Model',
      enabled: true,
      outputNamespace: 'model_call',
      primaryOutputName: 'text',
      lastEditedAt: '2025-01-01T00:00:00.000Z',
      config: {
        type: 'model-call',
        modelRef: {kind: 'fixed', endpointId: 'ep-1', modelName: 'llama3'},
        mode: 'generate',
        outputNames: ['text', 'rawResponse'],
      },
    }]);
    expect(pipelineStepChainRunReady(def, 'hello')).toBe(true);
  });

  it('allows a capsule instance with configured model slot bindings', () => {
    const def = makePipeline([{
      id: 'c1',
      type: 'capsule-instance',
      label: 'Capsule',
      enabled: true,
      outputNamespace: 'capsule_instance',
      primaryOutputName: 'text',
      lastEditedAt: '2025-01-01T00:00:00.000Z',
      config: {
        type: 'capsule-instance',
        capsuleId: 'cap-1',
        capsuleVersion: 'v1',
        inputBindings: {user_prompt: 'user_prompt.xml'},
        outputBindings: {result: 'capsule_instance.text'},
        modelSlotBindings: {
          main: {kind: 'fixed', endpointId: 'ep-1', modelName: 'llama3'},
        },
      },
    }]);
    expect(pipelineStepChainRunReady(def, 'hello')).toBe(true);
  });

  it('allows a capsule with no model slots when resolved via getCapsule', () => {
    const capsule = makeCapsule();
    const def = makePipeline([{
      id: 'c1',
      type: 'capsule-instance',
      label: 'Capsule',
      enabled: true,
      outputNamespace: 'capsule_instance',
      primaryOutputName: 'text',
      lastEditedAt: '2025-01-01T00:00:00.000Z',
      config: {
        type: 'capsule-instance',
        capsuleId: capsule.id,
        capsuleVersion: capsule.version,
        inputBindings: {user_prompt: 'user_prompt.xml'},
        outputBindings: {result: 'capsule_instance.text'},
      },
    }]);
    const getCapsule = () => capsule;
    expect(pipelineStepChainRunReady(def, 'hello', getCapsule)).toBe(true);
  });

  it('blocks a capsule with required model slots and no bindings', () => {
    const capsule = makeCapsule({
      interface: {
        inputs: [],
        outputs: [],
        parameters: [],
        modelSlots: [{name: 'main', suggestedBuckets: ['general'], required: true}],
      },
    });
    const def = makePipeline([{
      id: 'c1',
      type: 'capsule-instance',
      label: 'Capsule',
      enabled: true,
      outputNamespace: 'capsule_instance',
      primaryOutputName: 'text',
      lastEditedAt: '2025-01-01T00:00:00.000Z',
      config: {
        type: 'capsule-instance',
        capsuleId: capsule.id,
        capsuleVersion: capsule.version,
        inputBindings: {user_prompt: 'user_prompt.xml'},
        outputBindings: {result: 'capsule_instance.text'},
      },
    }]);
    expect(pipelineStepChainRunReady(def, 'hello', () => capsule)).toBe(false);
  });
});

describe('isCapsuleInstanceRunReady', () => {
  it('requires every bound slot to be configured', () => {
    const config = {
      type: 'capsule-instance' as const,
      capsuleId: 'cap-1',
      capsuleVersion: 'v1',
      inputBindings: {},
      outputBindings: {},
      modelSlotBindings: {
        main: {kind: 'fixed' as const, endpointId: '', modelName: 'llama3'},
      },
    };
    expect(isCapsuleInstanceRunReady(config)).toBe(false);
  });
});
