import {describe, expect, it} from 'vitest';
import type {DiscoveredModel} from '@lorca/core';
import {
  buildGeneratorModelCatalog,
  resolveGeneratorModelAssignments,
} from '../src/generatorModels.js';

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
    const {unresolved} = resolveGeneratorModelAssignments({
      steps: [],
      requests: [{stepId: 's1', stepKey: 'gen', modelId: 'ep-local::missing-model'}],
      models,
      endpoints: [{
        id: 'ep-local',
        name: 'Local',
        baseUrl: 'http://localhost:11434',
        kind: 'ollama',
        enabled: true,
        browserAccess: 'available',
        authKind: 'none',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      }],
    });
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0]?.reason).toContain('Unknown modelId');
  });

  it('resolves via bucket when modelId is invalid but bucket matches', () => {
    const {unresolved} = resolveGeneratorModelAssignments({
      steps: [],
      requests: [{stepId: 's1', stepKey: 'gen', modelId: 'bad::model', modelBucket: 'general'}],
      models,
      endpoints: [{
        id: 'ep-local',
        name: 'Local',
        baseUrl: 'http://localhost:11434',
        kind: 'ollama',
        enabled: true,
        browserAccess: 'available',
        authKind: 'none',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      }],
    });
    expect(unresolved).toHaveLength(0);
  });
});

describe('buildGeneratorModelCatalog', () => {
  it('lists enabled endpoint models with composite ids', () => {
    const catalog = buildGeneratorModelCatalog({
      models,
      endpoints: [{
        id: 'ep-local',
        name: 'Local',
        baseUrl: 'http://localhost:11434',
        kind: 'ollama',
        enabled: true,
        browserAccess: 'available',
        authKind: 'none',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      }],
    });
    expect(catalog[0]?.modelId).toBe('ep-local::llama3.2:latest');
  });
});
