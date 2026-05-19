import {describe, it, expect} from 'vitest';
import type {CapsuleDefinition} from '@lorca/core';
import {nextVersion, lockCapsule, createDraftFromLocked} from '../src/lock.js';

function makeDraft(overrides: Partial<CapsuleDefinition> = {}): CapsuleDefinition {
  const id = 'cap-test';
  return {
    schemaVersion: 1,
    id,
    name: 'Test Capsule',
    version: 'v1',
    status: 'draft',
    interface: {inputs: [], outputs: [], parameters: [], modelSlots: []},
    nodes: [{id: `${id}-input`, type: 'input'}],
    edges: [],
    outputRef: {nodeId: `${id}-input`, outputName: 'xml'},
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

  it('rejects an invalid capsule (duplicate node ids)', () => {
    const id = 'cap-test';
    const invalid = makeDraft({
      nodes: [{id: `${id}-input`, type: 'input'}, {id: `${id}-input`, type: 'manual-text', text: 'x'}],
    });
    const result = lockCapsule(invalid);
    expect(result.ok).toBe(false);
  });

  it('preserves nodes and interface', () => {
    const def = makeDraft();
    const result = lockCapsule(def);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.nodes).toEqual(def.nodes);
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

  it('copies nodes and interface from locked capsule', () => {
    const locked = makeDraft({status: 'locked', lockedAt: '2025-01-01T00:00:00.000Z'});
    const draft = createDraftFromLocked(locked, 'cap-new');
    expect(draft.nodes).toEqual(locked.nodes);
    expect(draft.interface).toEqual(locked.interface);
  });
});
