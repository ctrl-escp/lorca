import {describe, expect, it} from 'vitest';
import {createDefaultEndpoint} from '../src/stores/endpoints.js';

describe('createDefaultEndpoint', () => {
  it('seeds a disabled Local Ollama endpoint at 127.0.0.1:11434', () => {
    const ep = createDefaultEndpoint('ep-seed');
    expect(ep.id).toBe('ep-seed');
    expect(ep.name).toBe('Local Ollama');
    expect(ep.baseUrl).toBe('http://127.0.0.1:11434');
    expect(ep.kind).toBe('ollama');
    expect(ep.enabled).toBe(false);
    expect(ep.browserAccess).toBe('unknown');
    expect(ep.authKind).toBe('none');
    expect(ep.createdAt).toBe(ep.updatedAt);
  });
});
