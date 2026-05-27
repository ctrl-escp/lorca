import {describe, expect, it} from 'vitest';
import type {DiscoveredModel, PipelineStep} from '@lorca/core';
import {
  buildGeneratorModelCatalog,
  resolveGeneratorModelAssignments,
} from '../src/generatorModels.js';

const endpoints = [{
  id: 'ep-local',
  name: 'Local',
  baseUrl: 'http://localhost:11434',
  kind: 'ollama' as const,
  enabled: true,
  browserAccess: 'available' as const,
  authKind: 'none' as const,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}];

const models: DiscoveredModel[] = [
  {
    id: 'llama',
    endpointId: 'ep-local',
    providerModelName: 'llama3.2:latest',
    displayName: 'Llama 3.2',
    buckets: ['general'],
    source: 'manual',
    enabled: true,
  },
];

describe('resolveGeneratorModelAssignments', () => {
  it('reports unknown modelId when no bucket fallback', () => {
    const step: PipelineStep = {
      id: 's1',
      type: 'model-call',
      label: 'Gen',
      enabled: true,
      outputNamespace: 'gen',
      primaryOutputName: 'text',
      lastEditedAt: '2026-01-01T00:00:00Z',
      config: {
        type: 'model-call',
        modelRef: {kind: 'fixed', endpointId: '', modelName: ''},
        mode: 'generate',
        outputNames: ['text', 'rawResponse'],
      },
    };
    const {unresolved} = resolveGeneratorModelAssignments({
      steps: [step],
      requests: [{stepId: 's1', stepKey: 'gen', modelId: 'ep-local::missing-model'}],
      models,
      endpoints,
    });
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0]?.reason).toContain('Could not resolve');
  });

  it('resolves via bucket when modelId is invalid but bucket matches', () => {
    const step: PipelineStep = {
      id: 's1',
      type: 'model-call',
      label: 'Gen',
      enabled: true,
      outputNamespace: 'gen',
      primaryOutputName: 'text',
      lastEditedAt: '2026-01-01T00:00:00Z',
      config: {
        type: 'model-call',
        modelRef: {kind: 'fixed', endpointId: '', modelName: ''},
        mode: 'generate',
        outputNames: ['text', 'rawResponse'],
      },
    };
    const {steps, unresolved} = resolveGeneratorModelAssignments({
      steps: [step],
      requests: [{stepId: 's1', stepKey: 'gen', modelId: 'bad::model', modelBucket: 'general'}],
      models,
      endpoints,
    });
    expect(unresolved).toHaveLength(0);
    const ref = steps[0]?.config.type === 'model-call' ? steps[0].config.modelRef : null;
    expect(ref?.kind).toBe('fixed');
    if (ref?.kind === 'fixed') expect(ref.modelName).toBe('llama3.2:latest');
  });

  it('applies catalog modelId to steps', () => {
    const step: PipelineStep = {
      id: 's1',
      type: 'model-call',
      label: 'Gen',
      enabled: true,
      outputNamespace: 'gen',
      primaryOutputName: 'text',
      lastEditedAt: '2026-01-01T00:00:00Z',
      config: {
        type: 'model-call',
        modelRef: {kind: 'fixed', endpointId: '', modelName: ''},
        mode: 'generate',
        outputNames: ['text', 'rawResponse'],
      },
    };
    const {unresolved, steps} = resolveGeneratorModelAssignments({
      steps: [step],
      requests: [{stepId: 's1', stepKey: 'gen', modelId: 'ep-local::llama3.2:latest'}],
      models,
      endpoints,
    });
    expect(unresolved).toHaveLength(0);
    if (steps[0]?.config.type === 'model-call' && steps[0].config.modelRef.kind === 'fixed') {
      expect(steps[0].config.modelRef.endpointId).toBe('ep-local');
    }
  });
});

describe('buildGeneratorModelCatalog', () => {
  it('lists enabled endpoint models with composite ids', () => {
    const catalog = buildGeneratorModelCatalog({models, endpoints});
    expect(catalog[0]?.modelId).toBe('ep-local::llama3.2:latest');
  });
});
