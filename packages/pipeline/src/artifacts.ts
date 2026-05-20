import type {PipelineNode, PipelineOutputRef, PipelineStep} from '@lorca/core';

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

// Derives a full artifact key for a step's named output.
export function stepArtifactKey(step: PipelineStep, outputName?: string): string {
  return `${step.outputNamespace}.${outputName ?? step.primaryOutputName}`;
}

// Resolves an outputRef to an artifact key given the node list.
// For looped capsule instances, returns the .final. artifact key per spec §15.
export function resolveOutputRef(
  ref: PipelineOutputRef | undefined,
  nodes: PipelineNode[],
): string | null {
  if (!ref) return null;
  const node = nodes.find((n) => n.id === ref.nodeId);
  if (!node) return null;
  if (node.type === 'capsule-instance' && node.config.loop?.enabled) {
    const prefix = nodePrefix(node);
    const binding = node.config.outputBindings[ref.outputName];
    if (binding) return binding;
    return `${prefix}.final.${ref.outputName}`;
  }
  return outputKey(node, ref.outputName);
}
