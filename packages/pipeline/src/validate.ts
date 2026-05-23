import type {LegacyPipelineDefinition, PipelineDefinition, PipelineError, Result} from '@lorca/core';
import {ok, err} from '@lorca/core';
import {outputKey} from './artifacts.js';

export function validatePipeline(
  def: PipelineDefinition,
): Result<void, PipelineError> {
  const stepIds = new Set(def.steps.map((s) => s.id));
  if (stepIds.size !== def.steps.length) {
    return err({code: 'invalid_pipeline_graph', message: 'Duplicate step IDs detected'});
  }
  for (const step of def.steps) {
    const names = step.config.type === 'capsule-instance'
      ? null
      : (step.config as {outputNames: readonly string[]}).outputNames as readonly string[];
    if (names && !names.includes(step.primaryOutputName)) {
      return err({
        code: 'invalid_pipeline_graph',
        message: `Step "${step.id}" primaryOutputName "${step.primaryOutputName}" is not in outputNames`,
      });
    }
  }
  return ok(undefined);
}

export function validateLegacyPipeline(
  def: LegacyPipelineDefinition,
): Result<void, PipelineError> {
  // Unique node IDs
  const nodeIds = new Set(def.nodes.map((n) => n.id));
  if (nodeIds.size !== def.nodes.length) {
    return err({code: 'invalid_pipeline_graph', message: 'Duplicate node IDs detected'});
  }

  // At least one input node
  const inputNodes = def.nodes.filter((n) => n.type === 'input');
  if (inputNodes.length === 0) {
    return err({code: 'invalid_pipeline_graph', message: 'Pipeline must have an InputNode'});
  }
  if (inputNodes.length > 1) {
    return err({code: 'invalid_pipeline_graph', message: 'Pipeline must have exactly one InputNode'});
  }

  // outputRef resolves to a known node
  const outputNode = def.nodes.find((n) => n.id === def.outputRef.nodeId);
  if (!outputNode) {
    return err({
      code: 'invalid_pipeline_graph',
      message: `outputRef references unknown node: ${def.outputRef.nodeId}`,
    });
  }

  // Edge references valid node IDs
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

  // Cycle detection via DFS
  const cycleErr = detectCycle(def);
  if (cycleErr) return cycleErr;

  // Duplicate artifact keys
  const keyErr = checkDuplicateArtifactKeys(def);
  if (keyErr) return keyErr;

  return ok(undefined);
}

function detectCycle(def: LegacyPipelineDefinition): Result<never, PipelineError> | null {
  const adj = new Map<string, string[]>();
  for (const node of def.nodes) adj.set(node.id, []);
  for (const edge of def.edges) {
    adj.get(edge.fromNodeId)?.push(edge.toNodeId);
  }

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const node of def.nodes) color.set(node.id, WHITE);

  function dfs(id: string): boolean {
    color.set(id, GRAY);
    for (const next of adj.get(id) ?? []) {
      if (color.get(next) === GRAY) return true;
      if (color.get(next) === WHITE && dfs(next)) return true;
    }
    color.set(id, BLACK);
    return false;
  }

  for (const node of def.nodes) {
    if (color.get(node.id) === WHITE && dfs(node.id)) {
      return err({code: 'cycle_detected', message: 'Pipeline graph contains a cycle'});
    }
  }
  return null;
}

function checkDuplicateArtifactKeys(
  def: LegacyPipelineDefinition,
): Result<never, PipelineError> | null {
  const seen = new Set<string>();
  for (const node of def.nodes) {
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

function nodeOutputKeys(node: LegacyPipelineDefinition['nodes'][number]): string[] {
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
      // Capsule outputs are validated during capsule expansion (Phase 8)
      return [];
    default: {
      const _exhaustive: never = node;
      throw new Error(`Unknown node type: ${String(_exhaustive)}`);
    }
  }
}
