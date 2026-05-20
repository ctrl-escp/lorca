// @vitest-environment node
import {describe, it, expect} from 'vitest';
import type {DiscoveredModel, PipelineStep} from '@lorca/core';
import {pickModelRef, autoAssignModelToStep, modelMatchesBucket} from '../src/modelResolution.js';

const models: DiscoveredModel[] = [
  {
    id: 'm1',
    endpointId: 'ep-1',
    providerModelName: 'big:latest',
    displayName: 'Big',
    buckets: ['general'],
    source: 'discovered',
  },
  {
    id: 'm2',
    endpointId: 'ep-1',
    providerModelName: 'extract:latest',
    displayName: 'Extract',
    buckets: ['extract-json'],
    source: 'discovered',
  },
];

describe('modelResolution', () => {
  it('matches models by usage bucket', () => {
    expect(modelMatchesBucket(models[1]!, 'extract-json')).toBe(true);
    expect(modelMatchesBucket(models[0]!, 'extract-json')).toBe(false);
  });

  it('pickModelRef prefers the requested bucket', () => {
    expect(pickModelRef(models, 'extract-json')).toEqual({
      kind: 'fixed',
      endpointId: 'ep-1',
      modelName: 'extract:latest',
    });
  });

  it('autoAssignModelToStep fills empty model refs', () => {
    const step: PipelineStep = {
      id: 's1',
      type: 'model-call',
      label: 'Test',
      enabled: true,
      outputNamespace: 'test',
      primaryOutputName: 'text',
      lastEditedAt: new Date().toISOString(),
      config: {
        type: 'model-call',
        modelRef: {kind: 'fixed', endpointId: '', modelName: ''},
        mode: 'generate',
        outputNames: ['text', 'rawResponse'],
      },
    };
    const assigned = autoAssignModelToStep(step, models, 'extract-json');
    if (assigned.config.type === 'model-call') {
      expect(assigned.config.modelRef).toEqual({
        kind: 'fixed',
        endpointId: 'ep-1',
        modelName: 'extract:latest',
      });
    }
  });
});
