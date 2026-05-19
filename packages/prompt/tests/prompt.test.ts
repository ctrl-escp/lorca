import {describe, it, expect} from 'vitest';
import {escapePromptText, unescapePromptText} from '../src/escape.js';
import {buildUserPromptArtifacts} from '../src/envelope.js';
import {renderTemplate} from '../src/template.js';
import {isValidTag, isReservedTag} from '../src/tags.js';
import {renderPromptComposition, previewPromptXml} from '../src/render.js';

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

describe('renderPromptComposition', () => {
  const baseConfig = () => ({
    previousOutput: {enabled: false, placement: 'afterOwnPrompt' as 'beforeOwnPrompt' | 'afterOwnPrompt', tagName: 'previous_output'},
    historyReads: [],
    blocks: [
      {id: 'b1', label: 'System', tagName: 'system', body: 'You are helpful.', enabled: true, source: 'system-default' as const},
    ],
  });

  it('renders enabled blocks to xmlText', () => {
    const {xmlText} = renderPromptComposition(baseConfig());
    expect(xmlText).toBe('<system>\nYou are helpful.\n</system>');
  });

  it('skips disabled blocks', () => {
    const config = baseConfig();
    config.blocks[0]!.enabled = false;
    const {blocks, xmlText} = renderPromptComposition(config);
    expect(blocks).toHaveLength(0);
    expect(xmlText).toBe('');
  });

  it('skips blocks with invalid tag names', () => {
    const config = baseConfig();
    config.blocks[0]!.tagName = '1invalid';
    const {blocks} = renderPromptComposition(config);
    expect(blocks).toHaveLength(0);
  });

  it('omits previous-output block when resolvedPrevOutput is undefined', () => {
    const config = baseConfig();
    config.previousOutput.enabled = true;
    const {blocks} = renderPromptComposition(config, undefined);
    expect(blocks.every((b) => b.source !== 'previous-output')).toBe(true);
  });

  it('includes previous-output block when resolvedPrevOutput is provided', () => {
    const config = baseConfig();
    config.previousOutput.enabled = true;
    config.previousOutput.placement = 'afterOwnPrompt';
    const {blocks} = renderPromptComposition(config, 'prev text');
    const prevBlock = blocks.find((b) => b.source === 'previous-output');
    expect(prevBlock).toBeDefined();
    expect(prevBlock?.body).toBe('prev text');
    expect(prevBlock?.tagName).toBe('previous_output');
  });

  it('places previous output before own blocks when placement is beforeOwnPrompt', () => {
    const config = baseConfig();
    config.previousOutput.enabled = true;
    config.previousOutput.placement = 'beforeOwnPrompt';
    const {blocks} = renderPromptComposition(config, 'prev');
    expect(blocks[0]?.source).toBe('previous-output');
    expect(blocks[1]?.tagName).toBe('system');
  });

  it('places previous output after own blocks when placement is afterOwnPrompt', () => {
    const config = baseConfig();
    config.previousOutput.enabled = true;
    config.previousOutput.placement = 'afterOwnPrompt';
    const {blocks} = renderPromptComposition(config, 'prev');
    expect(blocks[0]?.tagName).toBe('system');
    expect(blocks[1]?.source).toBe('previous-output');
  });

  it('previewPromptXml shows placeholder for previous output', () => {
    const config = baseConfig();
    config.previousOutput.enabled = true;
    config.previousOutput.placement = 'beforeOwnPrompt';
    const xml = previewPromptXml(config);
    expect(xml).toContain('…previous step output…');
    expect(xml).toContain('<system>');
    expect(xml.indexOf('previous_output')).toBeLessThan(xml.indexOf('<system>'));
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
