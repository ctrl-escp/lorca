import type {CapsuleDefinition, PipelineEdge, PipelineError, PipelineNode, PipelineStep, Result} from '@lorca/core';
import {ok, err} from '@lorca/core';
import {outputKey, validatePipeline} from '@lorca/pipeline';

export function validateCapsule(def: CapsuleDefinition): Result<void, PipelineError> {
  if (def.steps !== undefined) {
    return validateStepChainCapsule(def);
  }

  const nodes = def.nodes ?? [];
  const edges = def.edges ?? [];

  const nodeIds = new Set(nodes.map((n) => n.id));
  if (nodeIds.size !== nodes.length) {
    return err({code: 'invalid_pipeline_graph', message: 'Duplicate node IDs detected'});
  }

  // Capsules may have at most one InputNode (not required)
  const inputNodes = nodes.filter((n) => n.type === 'input');
  if (inputNodes.length > 1) {
    return err({code: 'invalid_pipeline_graph', message: 'Capsule must have at most one InputNode'});
  }

  // CapsuleInstanceNode not supported inside Capsule in Phase 8
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

  const cycleErr = detectCycle(nodes, edges);
  if (cycleErr) return cycleErr;

  // Validate model slot references
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

function validateStepChainCapsule(def: CapsuleDefinition): Result<void, PipelineError> {
  const pipelineResult = validatePipeline({
    schemaVersion: 2,
    id: def.id,
    name: def.name,
    input: def.input ?? {raw: '', tagName: 'user_prompt', outputNamespace: 'user_prompt'},
    steps: def.steps ?? [],
    createdAt: def.createdAt,
    updatedAt: def.updatedAt,
  });
  if (!pipelineResult.ok) return pipelineResult;

  const slotErr = validateStepModelSlots(def.steps ?? [], new Set(def.interface.modelSlots.map((s) => s.name)));
  if (slotErr) return slotErr;

  const outputKeys = new Set(stepOutputKeys(def.steps ?? []));
  for (const output of def.interface.outputs) {
    if (output.sourceArtifactKey && !outputKeys.has(output.sourceArtifactKey)) {
      return err({
        code: 'invalid_capsule_interface',
        message: `Capsule output "${output.name}" references unknown artifact: ${output.sourceArtifactKey}`,
      });
    }
  }

  return ok(undefined);
}

function validateStepModelSlots(
  steps: PipelineStep[],
  declaredSlots: Set<string>,
): Result<never, PipelineError> | null {
  for (const step of steps) {
    if (step.config.type === 'model-call' && step.config.modelRef.kind === 'slot' && !declaredSlots.has(step.config.modelRef.slotName)) {
      return err({
        code: 'invalid_capsule_interface',
        message: `Model call step references undeclared model slot: ${step.config.modelRef.slotName}`,
        nodeId: step.id,
      });
    }
    if (step.config.type === 'loop-group') {
      const nested = validateStepModelSlots(step.config.steps, declaredSlots);
      if (nested) return nested;
    }
  }
  return null;
}

function stepOutputKeys(steps: PipelineStep[]): string[] {
  const keys: string[] = [];
  for (const step of steps) {
    switch (step.config.type) {
      case 'presentation':
        keys.push(`${step.outputNamespace}.text`);
        break;
      case 'model-call':
        keys.push(`${step.outputNamespace}.text`, `${step.outputNamespace}.rawResponse`);
        if (step.config.outputType === 'json' || step.config.outputType === 'auto') {
          keys.push(`${step.outputNamespace}.json`, `${step.outputNamespace}.jsonValid`);
        }
        break;
      case 'loop-group':
        keys.push(`${step.outputNamespace}.${step.primaryOutputName}`);
        keys.push(...stepOutputKeys(step.config.steps));
        break;
      case 'capsule-instance':
        for (const ref of Object.values(step.config.outputBindings)) keys.push(ref);
        break;
      default: {
        const _exhaustive: never = step.config;
        throw new Error(`Unknown step type: ${String((_exhaustive as {type: string}).type)}`);
      }
    }
  }
  return keys;
}

function detectCycle(nodes: PipelineNode[], edges: PipelineEdge[]): Result<never, PipelineError> | null {
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
      return err({code: 'cycle_detected', message: 'Capsule graph contains a cycle'});
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
        return err({code: 'duplicate_artifact_key', message: `Duplicate artifact key: ${key}`, nodeId: node.id});
      }
      seen.add(key);
    }
  }
  return null;
}

function nodeOutputKeys(node: PipelineNode): string[] {
  switch (node.type) {
    case 'input': return ['user_prompt.raw', 'user_prompt.xml'];
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
    case 'json-extract': return [outputKey(node, 'json')];
    case 'capsule-instance': return [];
    default: {
      const _exhaustive: never = node;
      throw new Error(`Unknown node type: ${String(_exhaustive)}`);
    }
  }
}
