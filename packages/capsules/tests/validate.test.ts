// @vitest-environment node
import {describe, it, expect} from 'vitest';
import type {CapsuleDefinition, CapsuleInterface, PipelineStep} from '@lorca/core';
import type {LegacyGraphCapsuleRecord} from '@lorca/core/legacy';
import {validateGraphCapsuleForImport} from '@lorca/pipeline/legacyGraph';
import {validateCapsule} from '../src/validate.js';

type GraphCapsuleFixture = LegacyGraphCapsuleRecord & {
  id: string;
  interface: CapsuleInterface;
};

function graphCapsule(overrides: Partial<GraphCapsuleFixture> = {}): GraphCapsuleFixture {
  const nodeId = 'model-1';
  return {
    id: 'cap-1',
    interface: {inputs: [], outputs: [], parameters: [], modelSlots: []},
    nodes: [
      {id: nodeId, type: 'model-call', artifactPrefix: 'result',
        config: {modelRef: {kind: 'fixed', endpointId: 'ep-1', modelName: 'llm'}, mode: 'generate', inputArtifactRef: 'user_prompt.xml'}},
    ],
    edges: [],
    outputRef: {nodeId, outputName: 'text'},
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
  return {
    schemaVersion: 2,
    id: 'cap-1',
    name: 'Test Capsule',
    version: 'v1',
    status: 'draft',
    interface: {
      inputs: [],
      outputs: [{name: 'result', kind: 'text', sourceArtifactKey: 'body.text'}],
      parameters: [],
      modelSlots: [],
    },
    steps: [textStep('body')],
    input: {raw: '', tagName: 'user_prompt', outputNamespace: 'user_prompt'},
    tests: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('validateGraphCapsuleForImport (graph-only import path)', () => {
  it('passes a minimal valid graph capsule', () => {
    expect(validateGraphCapsuleForImport(graphCapsule()).ok).toBe(true);
  });

  it('allows zero InputNodes', () => {
    expect(validateGraphCapsuleForImport(graphCapsule()).ok).toBe(true);
  });

  it('rejects two InputNodes', () => {
    const def = graphCapsule({
      nodes: [
        {id: 'in-1', type: 'input'},
        {id: 'in-2', type: 'input'},
      ],
      outputRef: {nodeId: 'in-1', outputName: 'xml'},
    });
    const result = validateGraphCapsuleForImport(def);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid_pipeline_graph');
  });

  it('rejects duplicate node IDs', () => {
    const def = graphCapsule({
      nodes: [
        {id: 'dup', type: 'manual-text', text: 'a'},
        {id: 'dup', type: 'manual-text', text: 'b'},
      ],
      outputRef: {nodeId: 'dup', outputName: 'text'},
    });
    expect(validateGraphCapsuleForImport(def).ok).toBe(false);
  });

  it('detects duplicate .json key from two expectedOutput=json nodes with same prefix', () => {
    const jsonModelNode = (id: string) => ({
      id,
      type: 'model-call' as const,
      artifactPrefix: 'result',
      config: {modelRef: {kind: 'fixed' as const, endpointId: 'ep-1', modelName: 'llm'}, mode: 'generate' as const, inputArtifactRef: 'user_prompt.xml', expectedOutput: 'json' as const},
    });
    const def = graphCapsule({
      nodes: [jsonModelNode('mc1'), jsonModelNode('mc2')],
      outputRef: {nodeId: 'mc1', outputName: 'text'},
    });
    const result = validateGraphCapsuleForImport(def);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('duplicate_artifact_key');
  });

  it('rejects invalid outputRef node', () => {
    const def = graphCapsule({outputRef: {nodeId: 'nonexistent', outputName: 'text'}});
    const result = validateGraphCapsuleForImport(def);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid_pipeline_graph');
  });

  it('rejects capsule-instance nodes (Phase 9)', () => {
    const def = graphCapsule({
      nodes: [
        {id: 'cap', type: 'capsule-instance', artifactPrefix: 'cap',
          config: {capsuleDefinitionId: 'x', capsuleVersion: 'v1', inputBindings: {}, outputBindings: {}, parameterValues: {}, modelSlotAssignments: {}}},
      ],
      outputRef: {nodeId: 'cap', outputName: 'result'},
    });
    const result = validateGraphCapsuleForImport(def);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('missing_capsule');
  });

  it('rejects slot ref for undeclared model slot', () => {
    const def = graphCapsule({
      nodes: [
        {id: 'mc', type: 'model-call', artifactPrefix: 'out',
          config: {modelRef: {kind: 'slot', slotName: 'undeclared_slot'}, mode: 'generate', inputArtifactRef: 'user_prompt.xml'}},
      ],
      outputRef: {nodeId: 'mc', outputName: 'text'},
    });
    const result = validateGraphCapsuleForImport(def);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid_capsule_interface');
  });

  it('accepts slot ref when slot is declared', () => {
    const def = graphCapsule({
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
    expect(validateGraphCapsuleForImport(def).ok).toBe(true);
  });

  it('detects cycles', () => {
    const def = graphCapsule({
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
    const result = validateGraphCapsuleForImport(def);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('cycle_detected');
  });
});

describe('validateCapsule (step-chain capsules)', () => {
  it('rejects capsules without steps', () => {
    const result = validateCapsule(stepChainCapsule({steps: []}));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('at least one step');
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

  it('ignores stale graph fields on in-memory objects when steps are canonical', () => {
    const stale = stepChainCapsule() as CapsuleDefinition & LegacyGraphCapsuleRecord;
    stale.nodes = [{id: 'missing-output', type: 'manual-text', text: 'stale'}];
    stale.outputRef = {nodeId: 'ghost', outputName: 'text'};
    expect(validateCapsule(stale).ok).toBe(true);
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
