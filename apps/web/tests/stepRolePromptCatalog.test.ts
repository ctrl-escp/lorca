import {describe, expect, it} from 'vitest';
import {
  dedupeStepRolePromptTemplates,
  getStepRolePromptCatalog,
  truncatePromptPreview,
} from '../src/utils/stepRolePromptCatalog.js';

describe('getStepRolePromptCatalog', () => {
  it('includes built-in suggestion role prompts', () => {
    const entries = getStepRolePromptCatalog();
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.some((e) => e.role === 'Intent Extraction')).toBe(true);
    expect(entries.some((e) => e.text.includes('You are an intent extractor'))).toBe(true);
    expect(entries.every((e) => e.source === 'suggestion' || e.source === 'example')).toBe(true);
  });

  it('includes example capsule step prompts', () => {
    const entries = getStepRolePromptCatalog();
    expect(entries.some((e) => e.source === 'example')).toBe(true);
    expect(entries.some((e) => e.role.includes('Intent Extraction'))).toBe(true);
  });

  it('does not include pipeline or user-input prompts', () => {
    const entries = getStepRolePromptCatalog();
    expect(entries.every((e) => e.category !== 'Pipeline input')).toBe(true);
    expect(entries.every((e) => !e.role.toLowerCase().includes('pipeline input'))).toBe(true);
  });

  it('excludes the current block text when requested', () => {
    const entries = getStepRolePromptCatalog();
    const sample = entries[0]!;
    const filtered = getStepRolePromptCatalog({excludeText: sample.text});
    expect(filtered.some((e) => e.text === sample.text)).toBe(false);
  });

  it('dedupes identical instruction text', () => {
    const deduped = dedupeStepRolePromptTemplates([
      {id: 'a', role: 'A', category: 'Extraction', source: 'suggestion', text: 'Same role prompt.'},
      {id: 'b', role: 'B', category: 'Example flow', source: 'example', text: 'Same role prompt.'},
    ]);
    expect(deduped).toHaveLength(1);
  });
});

describe('truncatePromptPreview', () => {
  it('collapses whitespace and truncates long text', () => {
    const long = 'a'.repeat(150);
    expect(truncatePromptPreview('  hello\n\nworld  ')).toBe('hello world');
    expect(truncatePromptPreview(long)).toHaveLength(120);
    expect(truncatePromptPreview(long).endsWith('…')).toBe(true);
  });
});
