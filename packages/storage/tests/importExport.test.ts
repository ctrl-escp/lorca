import {describe, it, expect} from 'vitest';
import type {CapsuleDefinition, PipelineDefinition} from '@lorca/core';
import {
  exportPipeline,
  exportCapsule,
  parsePipelineExport,
  parseCapsuleExport,
  previewPipelineImport,
  previewCapsuleImport,
  prepareImportedPipeline,
  prepareImportedCapsule,
  applyModelRemapsToNodes,
} from '../src/importExport.js';

function makePipeline(): PipelineDefinition {
  return {
    schemaVersion: 2,
    id: 'pipe-1',
    name: 'Export Me',
    input: {raw: '', tagName: 'user', outputNamespace: 'user_prompt'},
    steps: [
      {
        id: 'step-1',
        type: 'model-call',
        label: 'Main Model',
        enabled: true,
        outputNamespace: 'answer',
        primaryOutputName: 'text',
        lastEditedAt: '2026-01-01T00:00:00Z',
        config: {
          type: 'model-call',
          modelRef: {kind: 'fixed', endpointId: 'ep-old', modelName: 'llama3:latest'},
          mode: 'generate',
          outputNames: ['text', 'rawResponse'],
        },
      },
    ],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

function makeCapsule(): CapsuleDefinition {
  return {
    schemaVersion: 1,
    id: 'cap-1',
    name: 'Verifier',
    version: 'v1',
    status: 'locked',
    interface: {inputs: [], outputs: [], parameters: [], modelSlots: []},
    nodes: [{id: 'input-1', type: 'input'}],
    edges: [],
    outputRef: {nodeId: 'input-1', outputName: 'xml'},
    tests: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

const localCtx = {
  knownEndpointIds: new Set(['ep-local']),
  knownModelKeys: new Set(['ep-local::llama3:latest']),
  knownCapsuleKeys: new Set(['cap-1::v1']),
};

describe('importExport', () => {
  it('exports and parses a pipeline file', () => {
    const pipeline = makePipeline();
    const file = exportPipeline(pipeline);
    expect(file.app).toBe('lorca');
    expect(file.kind).toBe('pipeline');
    const parsed = parsePipelineExport(file);
    if ('errors' in parsed) throw new Error(parsed.errors.join(', '));
    expect(parsed.pipeline.name).toBe('Export Me');
  });

  it('rejects invalid import files', () => {
    const bad = parsePipelineExport({app: 'other', kind: 'pipeline', pipeline: {}});
    expect(bad).toMatchObject({ok: false, errors: expect.arrayContaining([expect.stringContaining('lorca')])});
  });

  it('detects missing model references on import preview', () => {
    const file = exportPipeline(makePipeline());
    const parsed = parsePipelineExport(file);
    if ('errors' in parsed) throw new Error(parsed.errors.join(', '));
    const preview = previewPipelineImport(parsed, localCtx);
    if ('errors' in preview) throw new Error(preview.errors.join(', '));
    expect(preview.missingModels).toHaveLength(1);
    expect(preview.missingModels[0]?.endpointId).toBe('ep-old');
  });

  it('applies model remaps to imported pipeline', () => {
    const pipeline = makePipeline();
    const remapped = prepareImportedPipeline(pipeline, 'pipe-new', {
      'step-1': {endpointId: 'ep-local', modelName: 'llama3:latest'},
    });
    const modelStep = remapped.steps.find((s) => s.id === 'step-1');
    expect(modelStep?.type).toBe('model-call');
    if (modelStep?.config.type === 'model-call') {
      expect(modelStep.config.modelRef).toEqual({
        kind: 'fixed',
        endpointId: 'ep-local',
        modelName: 'llama3:latest',
      });
    }
  });

  it('exports and imports a capsule file', () => {
    const capsule = makeCapsule();
    const file = exportCapsule(capsule);
    const parsed = parseCapsuleExport(file);
    if ('errors' in parsed) throw new Error(parsed.errors.join(', '));
    const preview = previewCapsuleImport(parsed, localCtx);
    if ('errors' in preview) throw new Error(preview.errors.join(', '));
    expect(preview.capsule.name).toBe('Verifier');
    expect(preview.missingModels).toHaveLength(0);
  });

  it('applyModelRemapsToNodes updates capsule instance slot assignments', () => {
    const nodes = applyModelRemapsToNodes(
      [{
        id: 'cap-node',
        type: 'capsule-instance',
        artifactPrefix: 'verifier',
        config: {
          capsuleDefinitionId: 'cap-1',
          capsuleVersion: 'v1',
          inputBindings: {},
          outputBindings: {},
          parameterValues: {},
          modelSlotAssignments: {
            judge: {endpointId: 'ep-old', modelName: 'big-model'},
          },
        },
      }],
      {'cap-node::judge': {endpointId: 'ep-local', modelName: 'llama3:latest'}},
    );
    const node = nodes[0];
    expect(node?.type).toBe('capsule-instance');
    if (node?.type === 'capsule-instance') {
      expect(node.config.modelSlotAssignments.judge).toEqual({
        endpointId: 'ep-local',
        modelName: 'llama3:latest',
      });
    }
  });

  it('prepareImportedCapsule assigns a new id', () => {
    const next = prepareImportedCapsule(makeCapsule(), 'cap-imported', {});
    expect(next.id).toBe('cap-imported');
    expect(next.id).not.toBe('cap-1');
  });
});
