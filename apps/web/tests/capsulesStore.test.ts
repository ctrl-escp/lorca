import {describe, it, expect, beforeEach} from 'vitest';
import {createPinia, setActivePinia} from 'pinia';
import type {CapsuleDefinition} from '@lorca/core';
import {useCapsulesStore} from '../src/stores/capsules.js';

function makeDraft(id: string, overrides: Partial<CapsuleDefinition> = {}): CapsuleDefinition {
  return {
    schemaVersion: 1,
    id,
    name: 'Test Capsule',
    version: 'v1',
    status: 'draft',
    interface: {inputs: [], outputs: [], parameters: [], modelSlots: []},
    steps: [],
    tests: [],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
});

describe('useCapsulesStore', () => {
  it('updateCapsule ignores id and status from a stale patch', () => {
    const store = useCapsulesStore();
    store.addCapsule(makeDraft('cap-new', {name: 'Best of Two (copy)'}));

    store.updateCapsule('cap-new', {
      ...makeDraft('example-best-of-two', {status: 'locked', lockedAt: '2025-01-01T00:00:00.000Z'}),
      name: 'Best of Two',
    });

    const cap = store.getCapsule('cap-new');
    expect(cap?.id).toBe('cap-new');
    expect(cap?.status).toBe('draft');
    expect(cap?.name).toBe('Best of Two');
  });

  it('lockCapsuleById locks a duplicated draft after stale status would have blocked it', () => {
    const store = useCapsulesStore();
    store.addCapsule(makeDraft('cap-new'));

    store.updateCapsule('cap-new', {
      ...makeDraft('example-best-of-two', {status: 'locked', lockedAt: '2025-01-01T00:00:00.000Z'}),
    });

    const result = store.lockCapsuleById('cap-new');
    expect(result.ok).toBe(true);
    expect(store.getCapsule('cap-new')?.status).toBe('locked');
  });
});
