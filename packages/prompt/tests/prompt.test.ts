import {describe, it, expect} from 'vitest';
import {escapePromptText, unescapePromptText} from '../src/escape.js';
import {buildUserPromptArtifacts} from '../src/envelope.js';
import {renderTemplate} from '../src/template.js';
import {isValidTag, isReservedTag} from '../src/tags.js';

describe('escapePromptText', () => {
  it('escapes &', () => expect(escapePromptText('a & b')).toBe('a &amp; b'));
  it('escapes <', () => expect(escapePromptText('a < b')).toBe('a &lt; b'));
  it('escapes >', () => expect(escapePromptText('a > b')).toBe('a &gt; b'));
  it('escapes all three', () => {
    expect(escapePromptText('<tag attr="a&b">')).toBe('&lt;tag attr="a&amp;b"&gt;');
  });
  it('preserves unescaped text', () => {
    expect(escapePromptText('hello world')).toBe('hello world');
  });
});

describe('unescapePromptText', () => {
  it('round-trips with escapePromptText', () => {
    const original = 'Look <here> & there > now';
    expect(unescapePromptText(escapePromptText(original))).toBe(original);
  });
});

describe('buildUserPromptArtifacts', () => {
  it('preserves raw text unchanged', () => {
    const {raw} = buildUserPromptArtifacts('Hello <world>');
    expect(raw).toBe('Hello <world>');
  });

  it('wraps xml in user_prompt tag', () => {
    const {xml} = buildUserPromptArtifacts('Hello');
    expect(xml).toBe('<user_prompt>\nHello\n</user_prompt>');
  });

  it('escapes special chars in xml artifact', () => {
    const {xml} = buildUserPromptArtifacts('a < b & c > d');
    expect(xml).toContain('&lt;');
    expect(xml).toContain('&amp;');
    expect(xml).toContain('&gt;');
    expect(xml).not.toContain('<b');
  });

  it('xml starts and ends with user_prompt tag', () => {
    const {xml} = buildUserPromptArtifacts('test');
    expect(xml.startsWith('<user_prompt>')).toBe(true);
    expect(xml.endsWith('</user_prompt>')).toBe(true);
  });
});

describe('renderTemplate', () => {
  it('substitutes artifact references', () => {
    const result = renderTemplate('Use: {{artifact.criteria.json}}', {
      artifacts: {'criteria.json': 'some json'},
      allowParams: false,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('Use: some json');
  });

  it('serializes object artifacts as pretty JSON', () => {
    const result = renderTemplate('{{artifact.data}}', {
      artifacts: {data: {key: 'val'}},
      allowParams: false,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toContain('"key": "val"');
  });

  it('fails on missing artifact reference', () => {
    const result = renderTemplate('{{artifact.missing}}', {
      artifacts: {},
      allowParams: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('template_render_failed');
      expect(result.error.message).toContain('artifact.missing');
    }
  });

  it('substitutes param references inside Capsule context', () => {
    const result = renderTemplate('Goal: {{param.extraction_goal}}', {
      artifacts: {},
      params: {extraction_goal: 'Extract the intent'},
      allowParams: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('Goal: Extract the intent');
  });

  it('rejects param references outside Capsule context', () => {
    const result = renderTemplate('{{param.foo}}', {
      artifacts: {},
      allowParams: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('template_render_failed');
  });

  it('treats \\{{ as a literal {{', () => {
    const result = renderTemplate('literal \\{{artifact.x}} end', {
      artifacts: {},
      allowParams: false,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('literal {{artifact.x}} end');
  });

  it('reports all missing keys in one error', () => {
    const result = renderTemplate('{{artifact.a}} and {{artifact.b}}', {
      artifacts: {},
      allowParams: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('artifact.a');
      expect(result.error.message).toContain('artifact.b');
    }
  });
});

describe('tag validation', () => {
  it('accepts valid tags', () => {
    expect(isValidTag('my_tag')).toBe(true);
    expect(isValidTag('task-input')).toBe(true);
    expect(isValidTag('tag123')).toBe(true);
  });

  it('rejects tags starting with digit', () => {
    expect(isValidTag('1tag')).toBe(false);
  });

  it('rejects uppercase tags', () => {
    expect(isValidTag('MyTag')).toBe(false);
  });

  it('rejects empty tag', () => {
    expect(isValidTag('')).toBe(false);
  });

  it('identifies reserved tags', () => {
    expect(isReservedTag('user_prompt')).toBe(true);
    expect(isReservedTag('acceptance_criteria')).toBe(true);
    expect(isReservedTag('my_custom_tag')).toBe(false);
  });
});
