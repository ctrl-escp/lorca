import {describe, expect, it} from 'vitest';
import {LORCA_PIPELINE_GENERATOR} from '../src/examples/definitions.js';

describe('LORCA_PIPELINE_GENERATOR', () => {
  it('uses schema v1 prompt and 4096 max tokens', () => {
    const step = LORCA_PIPELINE_GENERATOR.steps[0];
    expect(step?.config.type).toBe('model-call');
    if (step?.config.type !== 'model-call') return;
    expect(step.config.maxTokens).toBe(4096);
    const body = step.prompt?.blocks?.[0]?.body ?? '';
    expect(body).toContain('"schemaVersion": 1');
    expect(body).not.toMatch(/Return a concise ordered array/);
  });
});
