import {describe, it, expect} from 'vitest';
import type {CapsuleDefinition, LegacyPipelineDefinition} from '@lorca/core';
import {
  CAPSULE_SCHEMA_VERSION,
  normalizePersistedCapsule,
  normalizePersistedPipeline,
  capsuleNeedsPersistenceRewrite,
  pipelineNeedsPersistenceRewrite,
  isCapsuleImportSchemaVersion,
} from '../src/persistence.js';

function graphCapsule(): CapsuleDefinition {
  return {
    schemaVersion: 1,
    id: 'cap-graph',
    name: 'Graph Capsule',
    version: 'v1',
    status: 'locked',
    interface: {inputs: [], outputs: [], parameters: [], modelSlots: []},
    nodes: [
      {id: 'in', type: 'input'},
      {id: 'mt', type: 'manual-text', artifactPrefix: 'note', text: 'legacy note'},
    ],
    edges: [
      {id: 'e1', fromNodeId: 'in', fromOutput: 'xml', toNodeId: 'mt', toInput: 'input'},
    ],
    outputRef: {nodeId: 'mt', outputName: 'text'},
    tests: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function legacyPipeline(): LegacyPipelineDefinition {
  const inputId = 'input-1';
  const modelId = 'model-1';
  return {
    schemaVersion: 1,
    id: 'pipe-legacy',
    name: 'Legacy Pipeline',
    inputArtifactName: 'user_prompt',
    nodes: [
      {id: inputId, type: 'input'},
      {
        id: modelId,
        type: 'model-call',
        artifactPrefix: 'answer',
        config: {
          modelRef: {kind: 'fixed', endpointId: 'ep', modelName: 'm'},
          mode: 'generate',
          inputArtifactRef: 'user_prompt.xml',
        },
      },
    ],
    edges: [
      {id: 'e1', fromNodeId: inputId, fromOutput: 'xml', toNodeId: modelId, toInput: 'input'},
    ],
    outputRef: {nodeId: modelId, outputName: 'text'},
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('persistence normalization', () => {
  it('accepts capsule import schema versions 1 and 2 only', () => {
    expect(isCapsuleImportSchemaVersion(1)).toBe(true);
    expect(isCapsuleImportSchemaVersion(2)).toBe(true);
    expect(isCapsuleImportSchemaVersion(3)).toBe(false);
  });

  it('migrates graph-only capsules to schemaVersion 2 without legacy graph fields', () => {
    const normalized = normalizePersistedCapsule(graphCapsule());
    expect(normalized.schemaVersion).toBe(CAPSULE_SCHEMA_VERSION);
    expect(normalized.steps?.length).toBeGreaterThan(0);
    expect(normalized.nodes).toBeUndefined();
    expect(normalized.edges).toBeUndefined();
    expect(normalized.outputRef).toBeUndefined();
  });

  it('bumps step-chain capsules from schemaVersion 1 to 2', () => {
    const {nodes: _n, edges: _e, outputRef: _o, ...base} = graphCapsule();
    const capsule: CapsuleDefinition = {
      ...base,
      steps: [{
        id: 'body',
        type: 'presentation',
        label: 'Body',
        enabled: true,
        outputNamespace: 'body',
        primaryOutputName: 'text',
        lastEditedAt: '2026-01-01T00:00:00.000Z',
        config: {type: 'presentation', text: 'hello', outputNames: ['text']},
      }],
    };
    const normalized = normalizePersistedCapsule(capsule);
    expect(normalized.schemaVersion).toBe(2);
  });

  it('detects when a capsule record needs a persistence rewrite', () => {
    const before = graphCapsule();
    const after = normalizePersistedCapsule(before);
    expect(capsuleNeedsPersistenceRewrite(before, after)).toBe(true);
    expect(capsuleNeedsPersistenceRewrite(after, after)).toBe(false);
  });

  it('migrates legacy graph pipelines to V2 step chains', () => {
    const normalized = normalizePersistedPipeline(legacyPipeline());
    expect(normalized.schemaVersion).toBe(2);
    expect(normalized.steps.length).toBeGreaterThan(0);
    expect(pipelineNeedsPersistenceRewrite(legacyPipeline())).toBe(true);
    expect(pipelineNeedsPersistenceRewrite(normalized)).toBe(false);
  });
});
