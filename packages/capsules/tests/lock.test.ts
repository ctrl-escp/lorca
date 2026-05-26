import {describe, it, expect} from 'vitest';
import type {CapsuleDefinition, PipelineStep} from '@lorca/core';
import {nextVersion, lockCapsule, createDraftFromLocked} from '../src/lock.js';

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

function makeDraft(overrides: Partial<CapsuleDefinition> = {}): CapsuleDefinition {
  return {
    schemaVersion: 2,
    id: 'cap-test',
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
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('nextVersion', () => {
  it('increments v1 → v2', () => {
    expect(nextVersion('v1')).toBe('v2');
  });

  it('increments v9 → v10', () => {
    expect(nextVersion('v9')).toBe('v10');
  });

  it('increments v10 → v11', () => {
    expect(nextVersion('v10')).toBe('v11');
  });
});

describe('lockCapsule', () => {
  it('locks a valid draft capsule', () => {
    const result = lockCapsule(makeDraft());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe('locked');
    expect(result.value.lockedAt).toBeDefined();
    expect(result.value.version).toBe('v1');
  });

  it('rejects a capsule that is already locked', () => {
    const locked = makeDraft({status: 'locked', lockedAt: '2025-01-01T00:00:00.000Z'});
    const result = lockCapsule(locked);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('invalid_capsule_interface');
  });

  it('rejects an invalid capsule (duplicate step ids)', () => {
    const invalid = makeDraft({
      steps: [textStep('dup'), textStep('dup')],
    });
    const result = lockCapsule(invalid);
    expect(result.ok).toBe(false);
  });

  it('preserves steps and interface', () => {
    const def = makeDraft();
    const result = lockCapsule(def);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.steps).toEqual(def.steps);
    expect(result.value.interface).toEqual(def.interface);
  });
});

describe('createDraftFromLocked', () => {
  it('creates a new draft with bumped version', () => {
    const locked = makeDraft({status: 'locked', lockedAt: '2025-01-01T00:00:00.000Z'});
    const draft = createDraftFromLocked(locked, 'cap-new');
    expect(draft.status).toBe('draft');
    expect(draft.version).toBe('v2');
    expect(draft.id).toBe('cap-new');
  });

  it('clears lockedAt from the new draft', () => {
    const locked = makeDraft({status: 'locked', lockedAt: '2025-01-01T00:00:00.000Z'});
    const draft = createDraftFromLocked(locked, 'cap-new');
    expect('lockedAt' in draft).toBe(false);
  });

  it('copies steps and interface from locked capsule', () => {
    const locked = makeDraft({status: 'locked', lockedAt: '2025-01-01T00:00:00.000Z'});
    const draft = createDraftFromLocked(locked, 'cap-new');
    expect(draft.steps).toEqual(locked.steps);
    expect(draft.interface).toEqual(locked.interface);
  });
});
