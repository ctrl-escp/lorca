import {describe, it, expect, beforeEach} from 'vitest';
import {createPinia, setActivePinia} from 'pinia';
import {useActiveRunStore} from '../src/stores/activeRun.js';

beforeEach(() => {
  setActivePinia(createPinia());
});

describe('N3 partialRunTargetStepId lifecycle', () => {
  it('starts as null', () => {
    const store = useActiveRunStore();
    expect(store.partialRunTargetStepId).toBeNull();
  });

  it('reset() clears a pre-set value', () => {
    const store = useActiveRunStore();
    store.$patch({partialRunTargetStepId: 'step-abc'});
    expect(store.partialRunTargetStepId).toBe('step-abc');
    store.reset();
    expect(store.partialRunTargetStepId).toBeNull();
  });

  it('reset() also clears all other run state', () => {
    const store = useActiveRunStore();
    store.$patch({
      partialRunTargetStepId: 'step-abc',
      partial: true,
      executedStepIds: ['step-1', 'step-2'],
      rerunSingleStepId: 'step-1',
    });
    store.reset();
    expect(store.partialRunTargetStepId).toBeNull();
    expect(store.partial).toBe(false);
    expect(store.executedStepIds).toEqual([]);
    expect(store.rerunSingleStepId).toBeNull();
    expect(store.status).toBe('idle');
  });
});
