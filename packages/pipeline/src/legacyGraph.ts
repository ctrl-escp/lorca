/**
 * Legacy V1 graph helpers — import/migration and tests only. Not part of the public package API.
 */
import type {
  CapsuleDefinition,
  PipelineEdge,
  PipelineNode,
  PipelineOutputRef,
  PipelineError,
  Result,
} from '@lorca/core';
import type {LegacyGraphCapsuleRecord, LegacyPipelineDefinition} from '@lorca/core/legacy';
import {ok, err} from '@lorca/core';

export function nodePrefix(node: PipelineNode): string {
  return node.artifactPrefix ?? node.id;
}

export function outputKey(node: PipelineNode, outputName: string): string {
  if (node.type === 'input') {
    if (outputName === 'raw') return 'user_prompt.raw';
    if (outputName === 'xml') return 'user_prompt.xml';
  }
  return `${nodePrefix(node)}.${outputName}`;
}

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

export function topologicalOrder(def: LegacyPipelineDefinition): string[] {
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const node of def.nodes) {
    inDegree.set(node.id, 0);
    adj.set(node.id, []);
  }

  for (const edge of def.edges) {
    adj.get(edge.fromNodeId)?.push(edge.toNodeId);
    inDegree.set(edge.toNodeId, (inDegree.get(edge.toNodeId) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of adj.get(id) ?? []) {
      const newDeg = (inDegree.get(next) ?? 1) - 1;
      inDegree.set(next, newDeg);
      if (newDeg === 0) queue.push(next);
    }
  }

  return order;
}

export function validateLegacyPipeline(
  def: LegacyPipelineDefinition,
): Result<void, PipelineError> {
  const nodeIds = new Set(def.nodes.map((n) => n.id));
  if (nodeIds.size !== def.nodes.length) {
    return err({code: 'invalid_pipeline_graph', message: 'Duplicate node IDs detected'});
  }

  const inputNodes = def.nodes.filter((n) => n.type === 'input');
  if (inputNodes.length === 0) {
    return err({code: 'invalid_pipeline_graph', message: 'Pipeline must have an InputNode'});
  }
  if (inputNodes.length > 1) {
    return err({code: 'invalid_pipeline_graph', message: 'Pipeline must have exactly one InputNode'});
  }

  const outputNode = def.nodes.find((n) => n.id === def.outputRef.nodeId);
  if (!outputNode) {
    return err({
      code: 'invalid_pipeline_graph',
      message: `outputRef references unknown node: ${def.outputRef.nodeId}`,
    });
  }

  for (const edge of def.edges) {
    if (!nodeIds.has(edge.fromNodeId)) {
      return err({
        code: 'invalid_pipeline_graph',
        message: `Edge ${edge.id} references unknown fromNodeId: ${edge.fromNodeId}`,
      });
    }
    if (!nodeIds.has(edge.toNodeId)) {
      return err({
        code: 'invalid_pipeline_graph',
        message: `Edge ${edge.id} references unknown toNodeId: ${edge.toNodeId}`,
      });
    }
  }

  const cycleErr = detectCycle(def.nodes, def.edges, 'Pipeline graph contains a cycle');
  if (cycleErr) return cycleErr;

  const keyErr = checkDuplicateArtifactKeys(def.nodes);
  if (keyErr) return keyErr;

  return ok(undefined);
}

/** Graph-only capsule validation for legacy migration tests. */
export function validateGraphCapsuleForImport(
  def: LegacyGraphCapsuleRecord & Pick<CapsuleDefinition, 'id' | 'interface'>,
): Result<void, PipelineError> {
  const nodes = def.nodes ?? [];
  const edges = def.edges ?? [];

  const nodeIds = new Set(nodes.map((n) => n.id));
  if (nodeIds.size !== nodes.length) {
    return err({code: 'invalid_pipeline_graph', message: 'Duplicate node IDs detected'});
  }

  const inputNodes = nodes.filter((n) => n.type === 'input');
  if (inputNodes.length > 1) {
    return err({code: 'invalid_pipeline_graph', message: 'Capsule must have at most one InputNode'});
  }

  const capsuleNodes = nodes.filter((n) => n.type === 'capsule-instance');
  if (capsuleNodes.length > 0) {
    return err({
      code: 'missing_capsule',
      message: 'Nested Capsule instances inside a Capsule are not yet supported',
      nodeId: capsuleNodes[0]!.id,
    });
  }

  if (nodes.length > 0 && def.outputRef) {
    const outputNode = nodes.find((n) => n.id === def.outputRef!.nodeId);
    if (!outputNode) {
      return err({
        code: 'invalid_pipeline_graph',
        message: `outputRef references unknown node: ${def.outputRef.nodeId}`,
      });
    }
  }

  for (const edge of edges) {
    if (!nodeIds.has(edge.fromNodeId)) {
      return err({
        code: 'invalid_pipeline_graph',
        message: `Edge ${edge.id} references unknown fromNodeId: ${edge.fromNodeId}`,
      });
    }
    if (!nodeIds.has(edge.toNodeId)) {
      return err({
        code: 'invalid_pipeline_graph',
        message: `Edge ${edge.id} references unknown toNodeId: ${edge.toNodeId}`,
      });
    }
  }

  const cycleErr = detectCycle(nodes, edges, 'Capsule graph contains a cycle');
  if (cycleErr) return cycleErr;

  const declaredSlots = new Set(def.interface.modelSlots.map((s) => s.name));
  for (const node of nodes) {
    if (node.type === 'model-call' && node.config.modelRef.kind === 'slot') {
      if (!declaredSlots.has(node.config.modelRef.slotName)) {
        return err({
          code: 'invalid_capsule_interface',
          message: `ModelCallNode references undeclared model slot: ${node.config.modelRef.slotName}`,
          nodeId: node.id,
        });
      }
    }
  }

  const keyErr = checkDuplicateArtifactKeys(nodes);
  if (keyErr) return keyErr;

  return ok(undefined);
}

function detectCycle(
  nodes: PipelineNode[],
  edges: PipelineEdge[],
  message: string,
): Result<never, PipelineError> | null {
  const adj = new Map<string, string[]>();
  for (const node of nodes) adj.set(node.id, []);
  for (const edge of edges) {
    adj.get(edge.fromNodeId)?.push(edge.toNodeId);
  }

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const node of nodes) color.set(node.id, WHITE);

  function dfs(id: string): boolean {
    color.set(id, GRAY);
    for (const next of adj.get(id) ?? []) {
      if (color.get(next) === GRAY) return true;
      if (color.get(next) === WHITE && dfs(next)) return true;
    }
    color.set(id, BLACK);
    return false;
  }

  for (const node of nodes) {
    if (color.get(node.id) === WHITE && dfs(node.id)) {
      return err({code: 'cycle_detected', message});
    }
  }
  return null;
}

function checkDuplicateArtifactKeys(
  nodes: PipelineNode[],
): Result<never, PipelineError> | null {
  const seen = new Set<string>();
  for (const node of nodes) {
    const keys = nodeOutputKeys(node);
    for (const key of keys) {
      if (seen.has(key)) {
        return err({
          code: 'duplicate_artifact_key',
          message: `Duplicate artifact key: ${key}`,
          nodeId: node.id,
        });
      }
      seen.add(key);
    }
  }
  return null;
}

function nodeOutputKeys(node: PipelineNode): string[] {
  switch (node.type) {
    case 'input':
      return ['user_prompt.raw', 'user_prompt.xml'];
    case 'prompt-wrapper':
    case 'template':
    case 'manual-text':
      return [outputKey(node, 'text')];
    case 'model-call': {
      const keys = [outputKey(node, 'text'), outputKey(node, 'rawResponse')];
      if (node.config.expectedOutput === 'json') {
        keys.push(outputKey(node, 'parsedJson'));
        keys.push(outputKey(node, 'json'));
      }
      return keys;
    }
    case 'json-extract':
      return [outputKey(node, 'json')];
    case 'capsule-instance':
      return [];
    default: {
      const _exhaustive: never = node;
      throw new Error(`Unknown node type: ${String(_exhaustive)}`);
    }
  }
}

export {migrateLegacyPipeline} from './chainCompiler.js';
