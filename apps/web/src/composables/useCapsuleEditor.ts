import {ref, toRaw} from 'vue';
import type {CapsuleDefinition, PipelineNode, PipelineEdge} from '@lorca/core';
import {newId} from '../utils/id.js';

function rebuildEdges(nodes: PipelineNode[]): PipelineEdge[] {
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

function primaryOutput(node: PipelineNode): string {
  switch (node.type) {
    case 'input': return 'xml';
    case 'model-call': return 'text';
    case 'json-extract': return 'json';
    default: return 'text';
  }
}

function defaultNode(type: PipelineNode['type']): PipelineNode {
  const id = newId(type.replace(/-/g, '_'));
  switch (type) {
    case 'input': return {id, type: 'input'};
    case 'manual-text': return {id, type: 'manual-text', artifactPrefix: id, text: ''};
    case 'prompt-wrapper': return {
      id, type: 'prompt-wrapper', artifactPrefix: id,
      config: {tagName: 'instructions', instructionText: '', includeInputArtifact: true, inputPlacement: 'after-instructions'},
    };
    case 'template': return {id, type: 'template', artifactPrefix: id, template: ''};
    case 'model-call': return {
      id, type: 'model-call', artifactPrefix: id,
      config: {modelRef: {kind: 'fixed', endpointId: '', modelName: ''}, mode: 'generate', inputArtifactRef: 'user_prompt.xml'},
    };
    case 'json-extract': return {id, type: 'json-extract', artifactPrefix: id, inputArtifactRef: ''};
    case 'capsule-instance': return {
      id, type: 'capsule-instance', artifactPrefix: id,
      config: {capsuleDefinitionId: '', capsuleVersion: 'v1', inputBindings: {}, outputBindings: {}, parameterValues: {}, modelSlotAssignments: {}},
    };
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown node type: ${String(_exhaustive)}`);
    }
  }
}

export function useCapsuleEditor(initialDef: CapsuleDefinition) {
  const def = ref<CapsuleDefinition>(structuredClone(toRaw(initialDef)));

  function sync() {
    def.value = {...def.value, edges: rebuildEdges(def.value.nodes), updatedAt: new Date().toISOString()};
    const last = def.value.nodes.at(-1);
    if (last) {
      def.value = {...def.value, outputRef: {nodeId: last.id, outputName: primaryOutput(last)}};
    }
  }

  function addNode(type: PipelineNode['type']) {
    if (type === 'capsule-instance') return; // Phase 9
    const node = defaultNode(type);
    def.value = {...def.value, nodes: [...def.value.nodes, node]};
    sync();
  }

  function removeNode(nodeId: string) {
    if (def.value.nodes.find((n) => n.id === nodeId)?.type === 'input') return;
    def.value = {...def.value, nodes: def.value.nodes.filter((n) => n.id !== nodeId)};
    sync();
  }

  function moveNode(nodeId: string, direction: 'up' | 'down') {
    const nodes = [...def.value.nodes];
    const idx = nodes.findIndex((n) => n.id === nodeId);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= nodes.length) return;
    if (nodes[idx]?.type === 'input' || nodes[swapIdx]?.type === 'input') return;
    [nodes[idx], nodes[swapIdx]] = [nodes[swapIdx]!, nodes[idx]!];
    def.value = {...def.value, nodes};
    sync();
  }

  function updateNode(nodeId: string, patch: Record<string, unknown>) {
    def.value = {
      ...def.value,
      nodes: def.value.nodes.map((n) =>
        n.id === nodeId ? deepMerge(n as Record<string, unknown>, patch) as unknown as PipelineNode : n,
      ),
    };
    sync();
  }

  function updateInterface(patch: Partial<CapsuleDefinition['interface']>) {
    def.value = {
      ...def.value,
      interface: {...def.value.interface, ...patch},
      updatedAt: new Date().toISOString(),
    };
  }

  function updateMeta(patch: {name?: string; description?: string}) {
    def.value = {...def.value, ...patch, updatedAt: new Date().toISOString()};
  }

  return {def, addNode, removeNode, moveNode, updateNode, updateInterface, updateMeta};
}

function deepMerge(target: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out = {...target};
  for (const [k, v] of Object.entries(patch)) {
    if (v !== null && typeof v === 'object' && !Array.isArray(v) && typeof out[k] === 'object' && out[k] !== null) {
      out[k] = deepMerge(out[k] as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}
