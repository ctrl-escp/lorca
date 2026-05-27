import {describe, expect, it} from 'vitest';
import {buildRolePromptCatalog} from '../src/rolePromptCatalog.js';

describe('buildRolePromptCatalog', () => {
  it('includes built-in suggestion role prompts', () => {
    const entries = buildRolePromptCatalog();
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.some((e) => e.role === 'Intent Extraction')).toBe(true);
    expect(entries.some((e) => e.text.includes('You are an intent extractor'))).toBe(true);
    expect(entries.every((e) => e.source === 'suggestion' || e.source === 'example')).toBe(true);
  });

  it('includes example capsule step prompts', () => {
    const entries = buildRolePromptCatalog();
    expect(entries.some((e) => e.source === 'example')).toBe(true);
  });

  it('excludes the current block text when requested', () => {
    const entries = buildRolePromptCatalog();
    const sample = entries[0]!;
    const filtered = buildRolePromptCatalog({excludeText: sample.text});
    expect(filtered.some((e) => e.text === sample.text)).toBe(false);
  });
});
