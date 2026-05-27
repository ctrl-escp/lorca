import {describe, expect, it} from 'vitest';
import {dedupeStepRolePromptTemplates, truncatePromptPreview} from '../src/rolePromptCatalog.js';

describe('dedupeStepRolePromptTemplates', () => {
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
