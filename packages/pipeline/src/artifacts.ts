import type { PipelineNode, PipelineOutputRef } from '@lorca/core';

// Derives the artifact key prefix for a node.
export function nodePrefix(node: PipelineNode): string {
  return node.artifactPrefix ?? node.id;
}

// Derives a full artifact key for a node's named output.
export function outputKey(node: PipelineNode, outputName: string): string {
  if (node.type === 'input') {
    // InputNode outputs use global stable keys
    if (outputName === 'raw') return 'user_prompt.raw';
    if (outputName === 'xml') return 'user_prompt.xml';
  }
  return `${nodePrefix(node)}.${outputName}`;
}

// Resolves an outputRef to an artifact key given the node list.
export function resolveOutputRef(
  ref: PipelineOutputRef,
  nodes: PipelineNode[],
): string | null {
  const node = nodes.find((n) => n.id === ref.nodeId);
  if (!node) return null;
  return outputKey(node, ref.outputName);
}
