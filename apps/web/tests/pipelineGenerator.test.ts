import {describe, it, expect} from 'vitest';
import type {AiEndpointConfig, DiscoveredModel, PipelineStep} from '@lorca/core';
import {
  generatorCapsuleCompatible,
  selectPipelineGeneratorModel,
} from '../src/composables/usePipelineGenerator.js';
import {LORCA_PIPELINE_GENERATOR} from '@lorca/capsules';
import {resolveGeneratorModelAssignments} from '@lorca/endpoints';

function endpoint(id: string, enabled = true): AiEndpointConfig {
  return {
    id,
    name: id,
    kind: 'ollama',
    baseUrl: 'http://localhost:11434',
    enabled,
    browserAccess: 'available',
    authKind: 'none',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function model(id: string, endpointId: string, buckets: DiscoveredModel['buckets'], enabled = true): DiscoveredModel {
  return {
    id,
    endpointId,
    providerModelName: `${id}:latest`,
    displayName: id,
    buckets,
    source: 'manual',
    enabled,
  };
}

describe('pipeline generator model and capsule selection', () => {
  it('prefers general models on enabled endpoints', () => {
    const choice = selectPipelineGeneratorModel(
      [
        model('rewrite', 'ep', ['rewrite']),
        model('general', 'ep', ['general']),
      ],
      [endpoint('ep')],
    );

    expect(choice?.model.id).toBe('general');
  });

  it('recognizes the shipped generator capsule shape', () => {
    expect(generatorCapsuleCompatible(LORCA_PIPELINE_GENERATOR)).toBe(true);
  });
});

describe('resolveGeneratorModelAssignments on built steps', () => {
  it('writes model refs onto model-call steps', () => {
    const step: PipelineStep = {
      id: 'step_a',
      type: 'model-call',
      label: 'A',
      enabled: true,
      outputNamespace: 'a',
      primaryOutputName: 'text',
      lastEditedAt: '2026-01-01T00:00:00.000Z',
      config: {
        type: 'model-call',
        modelRef: {kind: 'fixed', endpointId: '', modelName: ''},
        mode: 'generate',
        outputNames: ['text', 'rawResponse'],
      },
    };
    const models = [model('general', 'ep', ['general'])];
    const endpoints = [endpoint('ep')];
    const {steps, unresolved} = resolveGeneratorModelAssignments({
      steps: [step],
      requests: [{
        stepId: 'step_a',
        stepKey: 'a',
        modelId: 'ep::general:latest',
      }],
      models,
      endpoints,
    });
    expect(unresolved).toHaveLength(0);
    expect(steps[0]?.config.type).toBe('model-call');
    if (steps[0]?.config.type === 'model-call') {
      expect(steps[0].config.modelRef).toEqual({
        kind: 'fixed',
        endpointId: 'ep',
        modelName: 'general:latest',
      });
    }
  });
});
