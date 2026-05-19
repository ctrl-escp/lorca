import type {
  CapsuleDefinition,
  CapsuleInterface,
  PipelineEdge,
  PipelineNode,
} from '@lorca/core';

export const EXAMPLE_TIMESTAMP = '2025-01-01T00:00:00.000Z';

function primaryOutput(node: PipelineNode): string {
  switch (node.type) {
    case 'input':
      return 'xml';
    case 'model-call':
      return 'text';
    case 'json-extract':
      return 'json';
    default:
      return 'text';
  }
}

export function linearEdges(nodes: PipelineNode[]): PipelineEdge[] {
  const edges: PipelineEdge[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    const from = nodes[i]!;
    const to = nodes[i + 1]!;
    edges.push({
      id: `e-${from.id}-${to.id}`,
      fromNodeId: from.id,
      fromOutput: primaryOutput(from),
      toNodeId: to.id,
      toInput: 'input',
    });
  }
  return edges;
}

export interface ExampleCapsuleSpec {
  id: string;
  name: string;
  description: string;
  interface: CapsuleInterface;
  nodes: PipelineNode[];
}

export function buildExampleCapsule(spec: ExampleCapsuleSpec): CapsuleDefinition {
  const last = spec.nodes[spec.nodes.length - 1]!;
  return {
    schemaVersion: 1,
    id: spec.id,
    name: spec.name,
    description: spec.description,
    version: 'v1',
    status: 'locked',
    interface: spec.interface,
    nodes: spec.nodes,
    edges: linearEdges(spec.nodes),
    outputRef: {nodeId: last.id, outputName: primaryOutput(last)},
    tests: [],
    createdAt: EXAMPLE_TIMESTAMP,
    updatedAt: EXAMPLE_TIMESTAMP,
    lockedAt: EXAMPLE_TIMESTAMP,
  };
}
