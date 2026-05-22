import {describe, expect, it} from 'vitest';
import {formatArtifactDisplay, tryParseJsonValue} from '../src/utils/formatArtifact.js';

describe('formatArtifactDisplay', () => {
  it('strips json fences and pretty-prints the inner JSON', () => {
    expect(formatArtifactDisplay('```json\n{"drifted":true,"severity":"low"}\n```')).toBe(
      '{\n  "drifted": true,\n  "severity": "low"\n}',
    );
  });

  it('parses fenced json values', () => {
    expect(tryParseJsonValue('```json\n[true, null]\n```')).toEqual([true, null]);
  });
});
