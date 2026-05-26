import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import {clearAllRunHistory, saveRunState, saveCapsuleRunState} from '../src/utils/runPersistence.js';

describe('clearAllRunHistory', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('removes pipeline and capsule run keys from localStorage', () => {
    saveRunState('pipe-1', {
      status: 'completed',
      artifacts: {},
      trace: [],
      finalOutputKey: null,
    });
    saveCapsuleRunState('cap-1', {
      status: 'failed',
      artifacts: {},
      trace: [],
      finalOutputKey: null,
    });
    localStorage.setItem('lorca:ui:paneFlexes', '{"left":2,"right":3}');

    clearAllRunHistory();

    expect(localStorage.getItem('lorca:run:pipe-1')).toBeNull();
    expect(localStorage.getItem('lorca:capsule-run:cap-1')).toBeNull();
    expect(localStorage.getItem('lorca:ui:paneFlexes')).toBe('{"left":2,"right":3}');
  });
});
