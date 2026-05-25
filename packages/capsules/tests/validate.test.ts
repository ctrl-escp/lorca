// @vitest-environment node
import {describe, it, expect} from 'vitest';
import type {CapsuleDefinition, PipelineStep} from '@lorca/core';
import {validateCapsule} from '../src/validate.js';

function minimalCapsule(overrides: Partial<CapsuleDefinition> = {}): CapsuleDefinition {
  const nodeId = 'model-1';
  return {
    schemaVersion: 1,
    id: 'cap-1',
    name: 'Test Capsule',
    version: 'v1',
    status: 'draft',
    interface: {inputs: [], outputs: [], parameters: [], modelSlots: []},
    nodes: [
      {id: nodeId, type: 'model-call', artifactPrefix: 'result',
        config: {modelRef: {kind: 'fixed', endpointId: 'ep-1', modelName: 'llm'}, mode: 'generate', inputArtifactRef: 'user_prompt.xml'}},
    ],
    edges: [],
    outputRef: {nodeId, outputName: 'text'},
    tests: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function textStep(id: string, text = 'ok', outputNamespace = id): PipelineStep {
  return {
    id,
    type: 'presentation',
    label: id,
    enabled: true,
    outputNamespace,
    primaryOutputName: 'text',
    lastEditedAt: '2026-01-01T00:00:00Z',
    config: {type: 'presentation', text, outputNames: ['text']},
  };
}

function stepChainCapsule(overrides: Partial<CapsuleDefinition> = {}): CapsuleDefinition {
  return minimalCapsule({
    nodes: [],
    edges: [],
    outputRef: {nodeId: 'body', outputName: 'text'},
    steps: [textStep('body')],
    input: {raw: '', tagName: 'user_prompt', outputNamespace: 'user_prompt'},
    interface: {
      inputs: [],
      outputs: [{name: 'result', kind: 'text', sourceArtifactKey: 'body.text'}],
      parameters: [],
      modelSlots: [],
    },
    ...overrides,
  });
}

describe('validateCapsule', () => {
  it('passes a minimal valid capsule', () => {
    expect(validateCapsule(minimalCapsule()).ok).toBe(true);
  });

  it('allows zero InputNodes', () => {
    const def = minimalCapsule();
    expect(validateCapsule(def).ok).toBe(true);
  });

  it('rejects two InputNodes', () => {
    const def = minimalCapsule({
      nodes: [
        {id: 'in-1', type: 'input'},
        {id: 'in-2', type: 'input'},
      ],
      outputRef: {nodeId: 'in-1', outputName: 'xml'},
    });
    const result = validateCapsule(def);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid_pipeline_graph');
  });

  it('rejects duplicate node IDs', () => {
    const def = minimalCapsule({
      nodes: [
        {id: 'dup', type: 'manual-text', text: 'a'},
        {id: 'dup', type: 'manual-text', text: 'b'},
      ],
      outputRef: {nodeId: 'dup', outputName: 'text'},
    });
    expect(validateCapsule(def).ok).toBe(false);
  });

  it('detects duplicate .json key from two expectedOutput=json nodes with same prefix', () => {
    const jsonModelNode = (id: string) => ({
      id,
      type: 'model-call' as const,
      artifactPrefix: 'result',
      config: {modelRef: {kind: 'fixed' as const, endpointId: 'ep-1', modelName: 'llm'}, mode: 'generate' as const, inputArtifactRef: 'user_prompt.xml', expectedOutput: 'json' as const},
    });
    const def = minimalCapsule({
      nodes: [jsonModelNode('mc1'), jsonModelNode('mc2')],
      outputRef: {nodeId: 'mc1', outputName: 'text'},
    });
    const result = validateCapsule(def);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('duplicate_artifact_key');
  });

  it('rejects invalid outputRef node', () => {
    const def = minimalCapsule({outputRef: {nodeId: 'nonexistent', outputName: 'text'}});
    const result = validateCapsule(def);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid_pipeline_graph');
  });

  it('rejects capsule-instance nodes (Phase 9)', () => {
    const def = minimalCapsule({
      nodes: [
        {id: 'cap', type: 'capsule-instance', artifactPrefix: 'cap',
          config: {capsuleDefinitionId: 'x', capsuleVersion: 'v1', inputBindings: {}, outputBindings: {}, parameterValues: {}, modelSlotAssignments: {}}},
      ],
      outputRef: {nodeId: 'cap', outputName: 'result'},
    });
    const result = validateCapsule(def);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('missing_capsule');
  });

  it('rejects slot ref for undeclared model slot', () => {
    const def = minimalCapsule({
      nodes: [
        {id: 'mc', type: 'model-call', artifactPrefix: 'out',
          config: {modelRef: {kind: 'slot', slotName: 'undeclared_slot'}, mode: 'generate', inputArtifactRef: 'user_prompt.xml'}},
      ],
      outputRef: {nodeId: 'mc', outputName: 'text'},
    });
    const result = validateCapsule(def);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid_capsule_interface');
  });

  it('accepts slot ref when slot is declared', () => {
    const def = minimalCapsule({
      interface: {
        inputs: [],
        outputs: [],
        parameters: [],
        modelSlots: [{name: 'main_model', suggestedBuckets: ['general'], required: true}],
      },
      nodes: [
        {id: 'mc', type: 'model-call', artifactPrefix: 'out',
          config: {modelRef: {kind: 'slot', slotName: 'main_model'}, mode: 'generate', inputArtifactRef: 'user_prompt.xml'}},
      ],
      outputRef: {nodeId: 'mc', outputName: 'text'},
    });
    expect(validateCapsule(def).ok).toBe(true);
  });

  it('detects cycles', () => {
    const def = minimalCapsule({
      nodes: [
        {id: 'a', type: 'manual-text', text: 'a'},
        {id: 'b', type: 'manual-text', text: 'b'},
      ],
      edges: [
        {id: 'e1', fromNodeId: 'a', fromOutput: 'text', toNodeId: 'b', toInput: 'input'},
        {id: 'e2', fromNodeId: 'b', fromOutput: 'text', toNodeId: 'a', toInput: 'input'},
      ],
      outputRef: {nodeId: 'a', outputName: 'text'},
    });
    const result = validateCapsule(def);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('cycle_detected');
  });

  it('validates step-chain capsules without legacy graph fields', () => {
    expect(validateCapsule(stepChainCapsule()).ok).toBe(true);
  });

  it('rejects duplicate step IDs in step-chain capsules', () => {
    const result = validateCapsule(stepChainCapsule({
      steps: [textStep('dup'), textStep('dup')],
    }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid_pipeline_graph');
  });

  it('ignores stale graph fields when steps are canonical', () => {
    const result = validateCapsule(stepChainCapsule({
      nodes: [
        {id: 'missing-output', type: 'manual-text', text: 'stale'},
      ],
      outputRef: {nodeId: 'ghost', outputName: 'text'},
    }));
    expect(result.ok).toBe(true);
  });

  it('rejects step-chain outputs that reference unknown artifacts', () => {
    const result = validateCapsule(stepChainCapsule({
      interface: {
        inputs: [],
        outputs: [{name: 'result', kind: 'text', sourceArtifactKey: 'ghost.text'}],
        parameters: [],
        modelSlots: [],
      },
    }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid_capsule_interface');
  });

  it('validates model slot refs in step-chain capsules', () => {
    const modelStep: PipelineStep = {
      id: 'mc',
      type: 'model-call',
      label: 'Model',
      enabled: true,
      outputNamespace: 'out',
      primaryOutputName: 'text',
      lastEditedAt: '2026-01-01T00:00:00Z',
      config: {
        type: 'model-call',
        modelRef: {kind: 'slot', slotName: 'main'},
        mode: 'generate',
        outputNames: ['text', 'rawResponse'],
      },
    };

    const result = validateCapsule(stepChainCapsule({
      steps: [modelStep],
      interface: {
        inputs: [],
        outputs: [{name: 'result', kind: 'text', sourceArtifactKey: 'out.text'}],
        parameters: [],
        modelSlots: [],
      },
    }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid_capsule_interface');

    expect(validateCapsule(stepChainCapsule({
      steps: [modelStep],
      interface: {
        inputs: [],
        outputs: [{name: 'result', kind: 'text', sourceArtifactKey: 'out.text'}],
        parameters: [],
        modelSlots: [{name: 'main', suggestedBuckets: ['general'], required: true}],
      },
    })).ok).toBe(true);
  });
});
