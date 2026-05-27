import {describe, it, expect} from 'vitest';
import type {CapsuleDefinition} from '@lorca/core';
import {getBuiltinExample} from '@lorca/capsules';
import {normalizeCapsuleStepChain} from '../src/capsuleExtraction.js';

function capsule(overrides: Partial<CapsuleDefinition> = {}): CapsuleDefinition {
  return {
    schemaVersion: 2,
    id: 'cap',
    name: 'Capsule',
    version: 'v1',
    status: 'draft',
    interface: {inputs: [], outputs: [], parameters: [], modelSlots: []},
    steps: [{
      id: 's1',
      type: 'presentation',
      label: 'Note',
      enabled: true,
      outputNamespace: 'note',
      primaryOutputName: 'text',
      lastEditedAt: '2026-01-01T00:00:00.000Z',
      config: {type: 'presentation', text: 'hi', outputNames: ['text']},
    }],
    input: {raw: '', tagName: 'user', outputNamespace: 'user_prompt'},
    tests: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('normalizeCapsuleStepChain', () => {
  it('keeps current steps and input', () => {
    const result = normalizeCapsuleStepChain(capsule());
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]!.label).toBe('Note');
    expect(result.input?.outputNamespace).toBe('user_prompt');
  });

  it('adds a default input when omitted', () => {
    const withoutInput = capsule();
    delete withoutInput.input;
    const result = normalizeCapsuleStepChain(withoutInput);
    expect(result.input).toEqual({raw: '', tagName: 'user', outputNamespace: 'user_prompt'});
  });

  it('keeps loop-group capsules in the step-chain shape', () => {
    const expert = getBuiltinExample('example-expert')!;
    const loaded = normalizeCapsuleStepChain(expert);
    expect(loaded.steps.some((s) => s.config.type === 'loop-group')).toBe(true);
  });
});
