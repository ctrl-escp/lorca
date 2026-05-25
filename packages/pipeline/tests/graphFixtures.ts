import type {CapsuleDefinition, PipelineNode} from '@lorca/core';

/** Minimal graph-only capsule fixtures for migration tests. */
export function makeGraphCapsule(nodes: PipelineNode[]): CapsuleDefinition {
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

export const GRAPH_CAPSULE_INPUT_NODE = {id: 'in', type: 'input' as const};

export const GRAPH_CAPSULE_MODEL_NODE = {
  id: 'mc',
  type: 'model-call' as const,
  artifactPrefix: 'mc',
  config: {
    modelRef: {kind: 'fixed' as const, endpointId: 'ep', modelName: 'm'},
    mode: 'generate' as const,
    inputArtifactRef: 'user_prompt.xml',
  },
};

export const GRAPH_CAPSULE_MANUAL_TEXT_NODE = {
  id: 'mt',
  type: 'manual-text' as const,
  artifactPrefix: 'note',
  text: 'hi',
};
