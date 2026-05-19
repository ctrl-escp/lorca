import { describe, it, expect } from 'vitest';
import { assignBuckets } from '../src/buckets.js';

describe('assignBuckets', () => {
  it('assigns tiny to small models', () => {
    expect(assignBuckets({ providerModelName: 'phi3:mini' })).toContain('tiny');
    expect(assignBuckets({ providerModelName: 'qwen3', parameterSize: '1.7b' })).toContain('tiny');
    expect(assignBuckets({ providerModelName: 'gemma', parameterSize: '2b' })).toContain('tiny');
  });

  it('does not assign tiny to large models', () => {
    expect(assignBuckets({ providerModelName: 'llama3', parameterSize: '70b' })).not.toContain('tiny');
  });

  it('assigns thinking to reasoning models', () => {
    expect(assignBuckets({ providerModelName: 'deepseek-r1:7b' })).toContain('thinking');
    expect(assignBuckets({ providerModelName: 'qwq:32b' })).toContain('thinking');
  });

  it('assigns extract-json to structured output models', () => {
    expect(assignBuckets({ providerModelName: 'hermes3:8b' })).toContain('extract-json');
    expect(assignBuckets({ providerModelName: 'mistral:7b' })).toContain('extract-json');
  });

  it('assigns general to common capable models', () => {
    expect(assignBuckets({ providerModelName: 'llama3.2:3b' })).toContain('general');
    expect(assignBuckets({ providerModelName: 'gemma3:27b' })).toContain('general');
    expect(assignBuckets({ providerModelName: 'qwen2.5:7b' })).toContain('general');
  });

  it('never returns an empty array', () => {
    const buckets = assignBuckets({ providerModelName: 'someunknownmodel' });
    expect(buckets.length).toBeGreaterThan(0);
  });

  it('assigns verify to judge/evaluator models', () => {
    expect(assignBuckets({ providerModelName: 'llama3-judgelm:8b' })).toContain('verify');
  });

  it('can assign multiple buckets to a single model', () => {
    // A small mistral model is both tiny and extract-json
    const buckets = assignBuckets({ providerModelName: 'mistral', parameterSize: '2b' });
    expect(buckets).toContain('tiny');
    expect(buckets).toContain('extract-json');
  });
});
