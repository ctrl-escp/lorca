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

  it('sets createdFromTemplateStepId to the original template step id', () => {
    const suggestion = getBuiltinSuggestion('suggestion-intent-extraction')!;
    const templateId = suggestion.insertableSteps[0]!.id;
    const [step] = instantiateSuggestion(suggestion, new Set());
    expect(step!.createdFromTemplateStepId).toBe(templateId);
    expect(step!.id).not.toBe(templateId);
  });

  it('uses semantic tag names in previousOutput', () => {
    const intentStep = getBuiltinSuggestion('suggestion-intent-extraction')!.insertableSteps[0]!;
    expect(intentStep.prompt!.previousOutput.tagName).toBe('user_request');

    const constraintStep = getBuiltinSuggestion('suggestion-constraint-extraction')!.insertableSteps[0]!;
    expect(constraintStep.prompt!.previousOutput.tagName).toBe('user_request');

    const rewriteStep = getBuiltinSuggestion('suggestion-prompt-rewrite')!.insertableSteps[0]!;
    expect(rewriteStep.prompt!.previousOutput.tagName).toBe('content_to_rewrite');

    const driftStep = getBuiltinSuggestion('suggestion-drift-check')!.insertableSteps[0]!;
    expect(driftStep.prompt!.previousOutput.tagName).toBe('output_to_review');

    const summaryStep = getBuiltinSuggestion('suggestion-summary')!.insertableSteps[0]!;
    expect(summaryStep.prompt!.previousOutput.tagName).toBe('source_content');
  });

  it('candidate-answer has previousOutput disabled and four history reads', () => {
    const step = getBuiltinSuggestion('suggestion-candidate-answer')!.insertableSteps[0]!;
    expect(step.prompt!.previousOutput.enabled).toBe(false);
    expect(step.prompt!.historyReads).toHaveLength(4);
    const tagNames = step.prompt!.historyReads.map((hr) => hr.tagName);
    expect(tagNames).toEqual(['task', 'acceptance_criteria', 'constraints', 'refined_task']);
  });

  it('remaps intra-suggestion historyRead sourceStepId after instantiation', () => {
    // Acceptance Criteria has a historyRead targeting 'intent-extraction' template ID.
    // Without existingSteps the read stays unresolved (template ID preserved).
    const acSuggestion = getBuiltinSuggestion('suggestion-acceptance-criteria')!;
    const [acStep] = instantiateSuggestion(acSuggestion, new Set());
    const intentRead = acStep!.prompt!.historyReads.find((hr) => hr.tagName === 'intent_analysis');
    expect(intentRead).toBeDefined();
    expect(intentRead!.sourceStepId).toBe('intent-extraction');
  });

  it('remaps cross-suggestion historyRead when existingSteps includes the source', () => {
    // Intent Extraction already in pipeline; Acceptance Criteria's intent_analysis read should resolve.
    const intentSuggestion = getBuiltinSuggestion('suggestion-intent-extraction')!;
    const [intentStep] = instantiateSuggestion(intentSuggestion, new Set());

    const acSuggestion = getBuiltinSuggestion('suggestion-acceptance-criteria')!;
    const [acStep] = instantiateSuggestion(acSuggestion, new Set(), [intentStep!]);

    const intentRead = acStep!.prompt!.historyReads.find((hr) => hr.tagName === 'intent_analysis');
    expect(intentRead).toBeDefined();
    expect(intentRead!.sourceStepId).toBe(intentStep!.id);
    expect(intentRead!.sourceStepId).not.toBe('intent-extraction');
  });

  // Roadmap N1-C explicit scenario: Acceptance Criteria → Candidate Answer
  it('Candidate Answer acceptance_criteria read resolves when AC already in pipeline', () => {
    const acSuggestion = getBuiltinSuggestion('suggestion-acceptance-criteria')!;
    const [acStep] = instantiateSuggestion(acSuggestion, new Set());

    const caSuggestion = getBuiltinSuggestion('suggestion-candidate-answer')!;
    const [caStep] = instantiateSuggestion(caSuggestion, new Set(), [acStep!]);

    const acRead = caStep!.prompt!.historyReads.find((hr) => hr.tagName === 'acceptance_criteria');
    expect(acRead).toBeDefined();
    expect(acRead!.sourceStepId).toBe(acStep!.id);
    expect(acRead!.sourceStepId).not.toBe('acceptance-criteria');
  });

  it('Candidate Answer acceptance_criteria read stays as template id with no existing steps', () => {
    const caSuggestion = getBuiltinSuggestion('suggestion-candidate-answer')!;
    const [caStep] = instantiateSuggestion(caSuggestion, new Set());

    const acRead = caStep!.prompt!.historyReads.find((hr) => hr.tagName === 'acceptance_criteria');
    expect(acRead).toBeDefined();
    expect(acRead!.sourceStepId).toBe('acceptance-criteria');
  });

  it('does not mutate the original suggestion template historyReads', () => {
    const intentSuggestion = getBuiltinSuggestion('suggestion-intent-extraction')!;
    const [intentStep] = instantiateSuggestion(intentSuggestion, new Set());

    const acSuggestion = getBuiltinSuggestion('suggestion-acceptance-criteria')!;
    const templateHistoryRead = acSuggestion.insertableSteps[0]!.prompt!.historyReads[0]!;
    const originalSourceStepId = templateHistoryRead.sourceStepId;

    instantiateSuggestion(acSuggestion, new Set(), [intentStep!]);

    // Template must be untouched
    expect(templateHistoryRead.sourceStepId).toBe(originalSourceStepId);
  });

  it('pipeline-input sourceStepId is preserved (not remapped)', () => {
    const candidateSuggestion = getBuiltinSuggestion('suggestion-candidate-answer')!;
    const [step] = instantiateSuggestion(candidateSuggestion, new Set());
    const taskRead = step!.prompt!.historyReads.find((hr) => hr.tagName === 'task');
    expect(taskRead!.sourceStepId).toBe('pipeline-input');
  });
});
