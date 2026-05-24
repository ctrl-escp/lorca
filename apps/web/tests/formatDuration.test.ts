import {describe, expect, it} from 'vitest';
import {formatDurationMs} from '../src/utils/formatDuration.js';

describe('formatDurationMs', () => {
  it('shows raw milliseconds when under one second', () => {
    expect(formatDurationMs(0)).toBe('0ms');
    expect(formatDurationMs(42)).toBe('42ms');
    expect(formatDurationMs(999)).toBe('999ms');
  });

  it('shows mm:ss.mss when one second or longer', () => {
    expect(formatDurationMs(1000)).toBe('00:01.000');
    expect(formatDurationMs(1500)).toBe('00:01.500');
    expect(formatDurationMs(65321)).toBe('01:05.321');
    expect(formatDurationMs(60_000)).toBe('01:00.000');
    expect(formatDurationMs(3_605_123)).toBe('60:05.123');
  });
});
