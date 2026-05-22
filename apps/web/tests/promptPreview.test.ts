import {describe, it, expect} from 'vitest';
import type {PipelineArtifact, PipelineStep} from '@lorca/core';
import {buildUserPromptArtifacts} from '@lorca/prompt';
import {resolveArtifactValue, resolvePreviousOutput, PREVIEW_TRUNCATE_CHARS} from '../src/utils/promptPreview.js';

function makeArtifact(name: string, value: unknown): PipelineArtifact {
  return {
    name,
    kind: typeof value === 'string' ? 'text' : 'json',
    value,
    createdAt: new Date().toISOString(),
  };
}

function makeStep(id: string, opts: {enabled?: boolean; namespace?: string; primaryOutput?: string} = {}): PipelineStep {
  return {
    id,
    type: 'model-call',
    label: id,
    enabled: opts.enabled ?? true,
    outputNamespace: opts.namespace ?? id.replace(/-/g, '_'),
    primaryOutputName: opts.primaryOutput ?? 'text',
    config: {type: 'model-call', modelRef: {kind: 'slot', slotKey: 'default'}} as PipelineStep['config'],
    lastEditedAt: new Date().toISOString(),
  };
}

const NO_USER_PROMPT = {raw: null, xml: null};
const WITH_USER_PROMPT = {raw: 'hello world', xml: '<user_prompt>\nhello world\n</user_prompt>'};

describe('resolveArtifactValue', () => {
  it('returns user_prompt.raw when present', () => {
    expect(resolveArtifactValue('user_prompt.raw', {}, WITH_USER_PROMPT)).toBe('hello world');
  });

  it('returns user_prompt.xml when present', () => {
    expect(resolveArtifactValue('user_prompt.xml', {}, WITH_USER_PROMPT)).toBe(
      '<user_prompt>\nhello world\n</user_prompt>',
    );
  });

  it('returns null for user_prompt.raw when no user prompt', () => {
    expect(resolveArtifactValue('user_prompt.raw', {}, NO_USER_PROMPT)).toBeNull();
  });

  it('returns null for user_prompt.xml when no user prompt', () => {
    expect(resolveArtifactValue('user_prompt.xml', {}, NO_USER_PROMPT)).toBeNull();
  });

  it('user_prompt.xml preserves boundary whitespace — no trimming before buildUserPromptArtifacts', () => {
    const raw = '  leading spaces and trailing newline  \n';
    const artifacts = buildUserPromptArtifacts(raw);
    const result = resolveArtifactValue('user_prompt.xml', {}, artifacts);
    expect(result).toContain('  leading spaces and trailing newline  \n');
  });

  it('returns artifact value when present', () => {
    const artifacts = {
      'step_one.text': makeArtifact('step_one.text', 'some output'),
    };
    expect(resolveArtifactValue('step_one.text', artifacts, NO_USER_PROMPT)).toBe('some output');
  });

  it('stringifies JSON artifact values', () => {
    const artifacts = {
      'step_one.json': makeArtifact('step_one.json', {key: 'value'}),
    };
    const result = resolveArtifactValue('step_one.json', artifacts, NO_USER_PROMPT);
    expect(result).toBe(JSON.stringify({key: 'value'}, null, 2));
  });

  it('returns null when artifact is absent', () => {
    expect(resolveArtifactValue('missing.text', {}, NO_USER_PROMPT)).toBeNull();
  });

  it('truncates long values at truncateAt chars with suffix', () => {
    const longValue = 'a'.repeat(500);
    const artifacts = {'step.text': makeArtifact('step.text', longValue)};
    const result = resolveArtifactValue('step.text', artifacts, NO_USER_PROMPT, 400);
    expect(result).toBe('a'.repeat(400) + '\n…(truncated)');
  });

  it('does not truncate when value is within truncateAt limit', () => {
    const shortValue = 'short text';
    const artifacts = {'step.text': makeArtifact('step.text', shortValue)};
    const result = resolveArtifactValue('step.text', artifacts, NO_USER_PROMPT, 400);
    expect(result).toBe('short text');
  });

  it('does not truncate when truncateAt is undefined', () => {
    const longValue = 'b'.repeat(1000);
    const artifacts = {'step.text': makeArtifact('step.text', longValue)};
    expect(resolveArtifactValue('step.text', artifacts, NO_USER_PROMPT)).toBe(longValue);
  });

  it('exports PREVIEW_TRUNCATE_CHARS = 400', () => {
    expect(PREVIEW_TRUNCATE_CHARS).toBe(400);
  });
});

describe('resolvePreviousOutput', () => {
  it('returns user prompt XML when no prior enabled step exists', () => {
    const steps = [makeStep('step-a')];
    const result = resolvePreviousOutput('step-a', steps, {}, WITH_USER_PROMPT);
    expect(result).toBe(WITH_USER_PROMPT.xml);
  });

  it('returns undefined when no prior step and no user prompt', () => {
    const steps = [makeStep('step-a')];
    const result = resolvePreviousOutput('step-a', steps, {}, NO_USER_PROMPT);
    expect(result).toBeUndefined();
  });

  it('returns prior step artifact when available', () => {
    const steps = [makeStep('step-a', {namespace: 'step_a'}), makeStep('step-b', {namespace: 'step_b'})];
    const artifacts = {'step_a.text': makeArtifact('step_a.text', 'prior output')};
    const result = resolvePreviousOutput('step-b', steps, artifacts, NO_USER_PROMPT);
    expect(result).toBe('prior output');
  });

  it('returns undefined when prior step artifact is absent', () => {
    const steps = [makeStep('step-a', {namespace: 'step_a'}), makeStep('step-b', {namespace: 'step_b'})];
    const result = resolvePreviousOutput('step-b', steps, {}, NO_USER_PROMPT);
    expect(result).toBeUndefined();
  });

  it('skips disabled prior steps', () => {
    const steps = [
      makeStep('step-a', {namespace: 'step_a', enabled: true}),
      makeStep('step-b', {namespace: 'step_b', enabled: false}),
      makeStep('step-c', {namespace: 'step_c'}),
    ];
    const artifacts = {
      'step_a.text': makeArtifact('step_a.text', 'a output'),
      'step_b.text': makeArtifact('step_b.text', 'b output'),
    };
    const result = resolvePreviousOutput('step-c', steps, artifacts, NO_USER_PROMPT);
    expect(result).toBe('a output');
  });

  it('optional history read with no artifact constructs omitted: true entry (caller responsibility)', () => {
    // This tests how the component constructs ResolvedHistoryRead[] — the
    // null return means the caller should set omitted: true for optional reads.
    const result = resolveArtifactValue('missing.text', {}, NO_USER_PROMPT);
    expect(result).toBeNull();
  });

  it('required history read with no artifact also returns null — caller sets omitted: false', () => {
    const result = resolveArtifactValue('missing_required.text', {}, NO_USER_PROMPT);
    expect(result).toBeNull();
  });
});
