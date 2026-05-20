import {describe, it, expect} from 'vitest';
import type {CapsuleDefinition, PipelineNode} from '@lorca/core';
import {ensureCapsuleStepChain} from '../src/capsuleExtraction.js';

function makeGraphCapsule(nodes: PipelineNode[]): CapsuleDefinition {
  const last = nodes.at(-1)!;
  return {
    schemaVersion: 1,
    id: 'cap-graph',
    name: 'Graph Capsule',
    version: 'v1',
    status: 'draft',
    interface: {inputs: [], outputs: [], parameters: [], modelSlots: []},
    nodes,
    edges: [
      {id: 'e1', fromNodeId: nodes[0]!.id, fromOutput: 'xml', toNodeId: nodes[1]!.id, toInput: 'input'},
    ],
    outputRef: {nodeId: last.id, outputName: 'text'},
    tests: [],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  };
}

describe('ensureCapsuleStepChain', () => {
  it('migrates graph-only capsules to steps[]', () => {
    const inputNode = {id: 'in', type: 'input' as const};
    const modelNode = {
      id: 'mc',
      type: 'model-call' as const,
      artifactPrefix: 'mc',
      config: {
        modelRef: {kind: 'fixed' as const, endpointId: 'ep', modelName: 'm'},
        mode: 'generate' as const,
        inputArtifactRef: 'user_prompt.xml',
      },
    };
    const migrated = ensureCapsuleStepChain(makeGraphCapsule([inputNode, modelNode]));
    expect(migrated.steps).toHaveLength(1);
    expect(migrated.steps![0]!.type).toBe('model-call');
    expect(migrated.input?.outputNamespace).toBe('user_prompt');
    expect((migrated.nodes ?? []).length).toBeGreaterThan(0);
  });

  it('keeps existing steps and refreshes legacy graph', () => {
    const inputNode = {id: 'in', type: 'input' as const};
    const manualNode = {id: 'mt', type: 'manual-text' as const, artifactPrefix: 'note', text: 'hi'};
    const capsule: CapsuleDefinition = {
      ...makeGraphCapsule([inputNode, manualNode]),
      steps: [{
        id: 's1',
        type: 'presentation',
        label: 'Note',
        enabled: true,
        outputNamespace: 'note',
        primaryOutputName: 'text',
        lastEditedAt: '2025-01-01T00:00:00.000Z',
        config: {type: 'presentation', text: 'hi', outputNames: ['text']},
      }],
      input: {raw: '', tagName: 'user', outputNamespace: 'user_prompt'},
    };
    const result = ensureCapsuleStepChain(capsule);
    expect(result.steps).toHaveLength(1);
    expect(result.steps![0]!.label).toBe('Note');
  });
});
