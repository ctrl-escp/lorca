import {describe, it, expect} from 'vitest';
import type {CapsuleDefinition} from '@lorca/core';
import {getBuiltinExample} from '@lorca/capsules';
import {ensureCapsuleStepChain} from '../src/capsuleExtraction.js';
import {
  GRAPH_CAPSULE_INPUT_NODE,
  GRAPH_CAPSULE_MANUAL_TEXT_NODE,
  GRAPH_CAPSULE_MODEL_NODE,
  makeGraphCapsule,
} from './graphFixtures.js';

describe('ensureCapsuleStepChain', () => {
  it('does not migrate graph-only capsules at runtime', () => {
    const normalized = ensureCapsuleStepChain(makeGraphCapsule([
      GRAPH_CAPSULE_INPUT_NODE,
      GRAPH_CAPSULE_MODEL_NODE,
    ]));
    expect(normalized.steps).toHaveLength(0);
    expect('nodes' in normalized).toBe(false);
    expect('edges' in normalized).toBe(false);
    expect('outputRef' in normalized).toBe(false);
  });

  it('keeps existing steps and strips stale legacy graph fields', () => {
    const capsule: CapsuleDefinition = {
      ...makeGraphCapsule([GRAPH_CAPSULE_INPUT_NODE, GRAPH_CAPSULE_MANUAL_TEXT_NODE]),
      steps: [{
        id: 's1',
        type: 'presentation',
        label: 'Note',
        enabled: true,
        outputNamespace: 'note',
        primaryOutputName: 'text',
        lastEditedAt: '2025-01-01T00:00:00.000Z',
        config: {type: 'presentation', text: 'hi', outputNames: ['text']},
      }],
      input: {raw: '', tagName: 'user', outputNamespace: 'user_prompt'},
    };
    const result = ensureCapsuleStepChain(capsule);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]!.label).toBe('Note');
    expect('nodes' in result).toBe(false);
    expect('edges' in result).toBe(false);
    expect('outputRef' in result).toBe(false);
  });

  it('does not synthesize legacy graph fields for capsules with loop-group steps', () => {
    const expert = getBuiltinExample('example-expert')!;
    const loaded = ensureCapsuleStepChain(expert);
    expect(loaded.steps.some((s) => s.config.type === 'loop-group')).toBe(true);
    expect('nodes' in loaded).toBe(false);
    expect('edges' in loaded).toBe(false);
    expect('outputRef' in loaded).toBe(false);
  });
});
