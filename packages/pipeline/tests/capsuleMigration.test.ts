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
  it('migrates graph-only capsules to steps[]', () => {
    const migrated = ensureCapsuleStepChain(makeGraphCapsule([
      GRAPH_CAPSULE_INPUT_NODE,
      GRAPH_CAPSULE_MODEL_NODE,
    ]));
    expect(migrated.steps).toHaveLength(1);
    expect(migrated.steps![0]!.type).toBe('model-call');
    expect(migrated.input?.outputNamespace).toBe('user_prompt');
    expect(migrated.nodes).toBeUndefined();
    expect(migrated.edges).toBeUndefined();
    expect(migrated.outputRef).toBeUndefined();
  });

  it('keeps existing steps and strips stale legacy graph', () => {
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
    expect(result.steps![0]!.label).toBe('Note');
    expect(result.nodes).toBeUndefined();
    expect(result.edges).toBeUndefined();
    expect(result.outputRef).toBeUndefined();
  });

  it('does not synthesize legacy graph fields for capsules with loop-group steps', () => {
    const expert = getBuiltinExample('example-expert')!;
    const loaded = ensureCapsuleStepChain(expert);
    expect(loaded.steps?.some((s) => s.config.type === 'loop-group')).toBe(true);
    expect(loaded.nodes).toBeUndefined();
    expect(loaded.edges).toBeUndefined();
    expect(loaded.outputRef).toBeUndefined();
  });
});
