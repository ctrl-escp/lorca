import {describe, it, expect} from 'vitest';
import type {PipelineDefinition} from '@lorca/core';
import {validatePipeline, topologicalOrder, resolveOutputRef} from '../src/index.js';

function base(): PipelineDefinition {
  return {
    schemaVersion: 1,
    id: 'p1',
    name: 'Test',
    inputArtifactName: 'user_prompt',
    nodes: [
      {id: 'in', type: 'input'},
      {id: 'mc', type: 'model-call', artifactPrefix: 'answer', config: {modelRef: {kind: 'fixed', endpointId: 'ep', modelName: 'm'}, mode: 'generate', inputArtifactRef: 'user_prompt.xml'}},
    ],
    edges: [{id: 'e1', fromNodeId: 'in', fromOutput: 'xml', toNodeId: 'mc', toInput: 'input'}],
    outputRef: {nodeId: 'mc', outputName: 'text'},
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

describe('validatePipeline', () => {
  it('accepts a valid minimal pipeline', () => {
    expect(validatePipeline(base()).ok).toBe(true);
  });

  it('rejects pipeline with no InputNode', () => {
    const def = base();
    def.nodes = def.nodes.filter((n) => n.type !== 'input');
    def.edges = [];
    const result = validatePipeline(def);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid_pipeline_graph');
  });

  it('rejects outputRef pointing to unknown node', () => {
    const def = {...base(), outputRef: {nodeId: 'ghost', outputName: 'text'}};
    const result = validatePipeline(def);
    expect(result.ok).toBe(false);
  });

  it('detects a cycle', () => {
    const def = base();
    // Add a back-edge mc → in
    def.edges.push({id: 'e2', fromNodeId: 'mc', fromOutput: 'text', toNodeId: 'in', toInput: 'x'});
    const result = validatePipeline(def);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('cycle_detected');
  });

  it('detects duplicate artifact keys from two nodes with same prefix', () => {
    const def = base();
    def.nodes.push({id: 'mc2', type: 'model-call', artifactPrefix: 'answer', config: {modelRef: {kind: 'fixed', endpointId: 'ep', modelName: 'm'}, mode: 'generate', inputArtifactRef: 'user_prompt.xml'}});
    const result = validatePipeline(def);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('duplicate_artifact_key');
  });
});

describe('topologicalOrder', () => {
  it('returns input before model-call', () => {
    const order = topologicalOrder(base());
    expect(order.indexOf('in')).toBeLessThan(order.indexOf('mc'));
  });

  it('handles a three-node chain', () => {
    const def: PipelineDefinition = {
      ...base(),
      nodes: [
        {id: 'n1', type: 'input'},
        {id: 'n2', type: 'manual-text', artifactPrefix: 't', text: 'hi'},
        {id: 'n3', type: 'model-call', artifactPrefix: 'r', config: {modelRef: {kind: 'fixed', endpointId: 'ep', modelName: 'm'}, mode: 'generate', inputArtifactRef: 't.text'}},
      ],
      edges: [
        {id: 'e1', fromNodeId: 'n1', fromOutput: 'xml', toNodeId: 'n2', toInput: 'input'},
        {id: 'e2', fromNodeId: 'n2', fromOutput: 'text', toNodeId: 'n3', toInput: 'input'},
      ],
    };
    const order = topologicalOrder(def);
    expect(order[0]).toBe('n1');
    expect(order[1]).toBe('n2');
    expect(order[2]).toBe('n3');
  });
});

describe('resolveOutputRef', () => {
  it('resolves InputNode raw output to global key', () => {
    const nodes = base().nodes;
    expect(resolveOutputRef({nodeId: 'in', outputName: 'raw'}, nodes)).toBe('user_prompt.raw');
    expect(resolveOutputRef({nodeId: 'in', outputName: 'xml'}, nodes)).toBe('user_prompt.xml');
  });

  it('resolves model-call output using artifactPrefix', () => {
    const nodes = base().nodes;
    expect(resolveOutputRef({nodeId: 'mc', outputName: 'text'}, nodes)).toBe('answer.text');
  });

  it('returns null for unknown nodeId', () => {
    expect(resolveOutputRef({nodeId: 'ghost', outputName: 'text'}, base().nodes)).toBeNull();
  });
});
