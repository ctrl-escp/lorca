import {describe, expect, it} from 'vitest';
import type {PipelineDefinition, PipelineStep} from '@lorca/core';
import {isDefaultPipelineStub} from '../../src/generator/stub.js';

function makePipeline(steps: PipelineStep[], overrides: Partial<PipelineDefinition> = {}): PipelineDefinition {
  return {
    schemaVersion: 2,
    id: 'p1',
    name: 'New Pipeline',
    input: {raw: '', tagName: 'user', outputNamespace: 'user_prompt'},
    steps,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('isDefaultPipelineStub', () => {
  it('is true for factory default single model-call pipeline', () => {
    const pipeline = makePipeline([
      {
        id: 'm1',
        type: 'model-call',
        label: 'Model Call',
        enabled: true,
        outputNamespace: 'answer',
        primaryOutputName: 'text',
        lastEditedAt: '2026-01-01T00:00:00Z',
        config: {
          type: 'model-call',
          modelRef: {kind: 'fixed', endpointId: '', modelName: ''},
          mode: 'generate',
          outputNames: ['text', 'rawResponse'],
        },
      },
    ]);
    expect(isDefaultPipelineStub(pipeline)).toBe(true);
  });

  it('is false when the user customized the step label', () => {
    const pipeline = makePipeline([
      {
        id: 'm1',
        type: 'model-call',
        label: 'My summarizer',
        enabled: true,
        outputNamespace: 'answer',
        primaryOutputName: 'text',
        lastEditedAt: '2026-01-01T00:00:00Z',
        config: {
          type: 'model-call',
          modelRef: {kind: 'fixed', endpointId: '', modelName: ''},
          mode: 'generate',
          outputNames: ['text', 'rawResponse'],
        },
      },
    ]);
    expect(isDefaultPipelineStub(pipeline)).toBe(false);
  });

  it('is false when a model is configured', () => {
    const pipeline = makePipeline([
      {
        id: 'm1',
        type: 'model-call',
        label: 'Model Call',
        enabled: true,
        outputNamespace: 'answer',
        primaryOutputName: 'text',
        lastEditedAt: '2026-01-01T00:00:00Z',
        config: {
          type: 'model-call',
          modelRef: {kind: 'fixed', endpointId: 'ep', modelName: 'llama'},
          mode: 'generate',
          outputNames: ['text', 'rawResponse'],
        },
      },
    ]);
    expect(isDefaultPipelineStub(pipeline)).toBe(false);
  });
});
