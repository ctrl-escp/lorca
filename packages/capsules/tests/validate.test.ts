// @vitest-environment node
import {describe, it, expect} from 'vitest';
import type {CapsuleDefinition, PipelineStep} from '@lorca/core';
import {validateCapsule} from '../src/validate.js';

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

describe('validateCapsule (step-chain capsules)', () => {
  it('rejects capsules without steps', () => {
    const result = validateCapsule(stepChainCapsule({steps: []}));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('at least one step');
  });

  it('validates step-chain capsules', () => {
    expect(validateCapsule(stepChainCapsule()).ok).toBe(true);
  });

  it('rejects duplicate step IDs in step-chain capsules', () => {
    const result = validateCapsule(stepChainCapsule({
      steps: [textStep('dup'), textStep('dup')],
    }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid_pipeline_graph');
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
