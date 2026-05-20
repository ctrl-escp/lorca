// @vitest-environment node
import {describe, it, expect} from 'vitest';
import {
  BUILTIN_SUGGESTIONS,
  instantiateSuggestion,
  getBuiltinSuggestion,
} from '../src/suggestions/index.js';

describe('step suggestions', () => {
  it('defines all eight built-in suggestions', () => {
    expect(BUILTIN_SUGGESTIONS).toHaveLength(8);
    expect(BUILTIN_SUGGESTIONS.map((s) => s.id)).toEqual([
      'suggestion-intent-extraction',
      'suggestion-acceptance-criteria',
      'suggestion-constraint-extraction',
      'suggestion-prompt-rewrite',
      'suggestion-candidate-answer',
      'suggestion-answer-verification',
      'suggestion-drift-check',
      'suggestion-summary',
    ]);
  });

  it('assigns preferred model buckets by suggestion category', () => {
    expect(getBuiltinSuggestion('suggestion-intent-extraction')?.preferredModelBucket).toBe('extract-json');
    expect(getBuiltinSuggestion('suggestion-prompt-rewrite')?.preferredModelBucket).toBe('rewrite');
    expect(getBuiltinSuggestion('suggestion-answer-verification')?.preferredModelBucket).toBe('verify');
    expect(getBuiltinSuggestion('suggestion-summary')?.preferredModelBucket).toBe('summarize');
  });

  it('instantiateSuggestion creates unique ids and output namespaces', () => {
    const suggestion = getBuiltinSuggestion('suggestion-intent-extraction')!;
    const first = instantiateSuggestion(suggestion, new Set(['intent_extraction']));
    const second = instantiateSuggestion(suggestion, new Set(['intent_extraction', 'intent_extraction_1']));

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(first[0]!.id).not.toBe(second[0]!.id);
    expect(first[0]!.outputNamespace).toBe('intent_extraction_1');
    expect(second[0]!.outputNamespace).toBe('intent_extraction_2');
  });

  it('preserves suggestion provenance and clones prompt block ids', () => {
    const suggestion = getBuiltinSuggestion('suggestion-intent-extraction')!;
    const sourceBlockId = suggestion.insertableSteps[0]!.prompt!.blocks[0]!.id;
    const [step] = instantiateSuggestion(suggestion, new Set());
    expect(step!.createdFromSuggestionId).toBe(suggestion.id);
    expect(step!.prompt?.blocks[0]?.id).not.toBe(sourceBlockId);
  });
});
