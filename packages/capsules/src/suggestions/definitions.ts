import type {PipelineSuggestion} from './types.js';

function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function now(): string {
  return new Date().toISOString();
}

export const SUGGESTION_INTENT_EXTRACTION: PipelineSuggestion = {
  id: 'suggestion-intent-extraction',
  name: 'Intent Extraction',
  description: 'Extract structured intent and topics from the user prompt using a fast model call.',
  category: 'extraction',
  preferredModelBucket: 'extract-json',
  requiredBindings: [],
  outputHints: [{stepId: 'intent-extraction', outputName: 'text', description: 'Extracted intent as JSON text'}],
  insertableSteps: [
    {
      id: 'intent-extraction',
      type: 'model-call',
      label: 'Intent Extraction',
      enabled: true,
      outputNamespace: 'intent_extraction',
      primaryOutputName: 'text',
      lastEditedAt: now(),
      config: {
        type: 'model-call',
        modelRef: {kind: 'fixed', endpointId: '', modelName: ''},
        mode: 'generate',
        outputNames: ['text', 'rawResponse'],
      },
      prompt: {
        previousOutput: {enabled: true, placement: 'afterOwnPrompt', tagName: 'user_prompt'},
        historyReads: [],
        blocks: [
          {
            id: makeId(),
            label: 'Instructions',
            tagName: 'system',
            body: 'Extract the user intent from the prompt below.\nRespond with JSON only using this shape:\n{ "intent": string, "topics": string[], "confidence": number }',
            enabled: true,
            source: 'system-default',
          },
        ],
      },
    },
  ],
};

export const SUGGESTION_ACCEPTANCE_CRITERIA: PipelineSuggestion = {
  id: 'suggestion-acceptance-criteria',
  name: 'Acceptance Criteria',
  description: 'Generate testable acceptance criteria from the user prompt.',
  category: 'planning',
  preferredModelBucket: 'general',
  requiredBindings: [],
  outputHints: [{stepId: 'acceptance-criteria', outputName: 'text', description: 'Acceptance criteria as JSON text'}],
  insertableSteps: [
    {
      id: 'acceptance-criteria',
      type: 'model-call',
      label: 'Acceptance Criteria',
      enabled: true,
      outputNamespace: 'acceptance_criteria',
      primaryOutputName: 'text',
      lastEditedAt: now(),
      config: {
        type: 'model-call',
        modelRef: {kind: 'fixed', endpointId: '', modelName: ''},
        mode: 'generate',
        outputNames: ['text', 'rawResponse'],
      },
      prompt: {
        previousOutput: {enabled: true, placement: 'afterOwnPrompt', tagName: 'previous_output'},
        historyReads: [],
        blocks: [
          {
            id: makeId(),
            label: 'Instructions',
            tagName: 'system',
            body: 'Generate clear, testable acceptance criteria for the request below.\nRespond with JSON only:\n{ "criteria": string[], "assumptions": string[] }',
            enabled: true,
            source: 'system-default',
          },
        ],
      },
    },
  ],
};

export const SUGGESTION_CONSTRAINT_EXTRACTION: PipelineSuggestion = {
  id: 'suggestion-constraint-extraction',
  name: 'Constraint Extraction',
  description: 'Extract explicit constraints and requirements from the user prompt.',
  category: 'extraction',
  preferredModelBucket: 'extract-json',
  requiredBindings: [],
  outputHints: [{stepId: 'constraint-extraction', outputName: 'text', description: 'Extracted constraints as JSON'}],
  insertableSteps: [
    {
      id: 'constraint-extraction',
      type: 'model-call',
      label: 'Constraint Extraction',
      enabled: true,
      outputNamespace: 'constraint_extraction',
      primaryOutputName: 'text',
      lastEditedAt: now(),
      config: {
        type: 'model-call',
        modelRef: {kind: 'fixed', endpointId: '', modelName: ''},
        mode: 'generate',
        outputNames: ['text', 'rawResponse'],
      },
      prompt: {
        previousOutput: {enabled: true, placement: 'afterOwnPrompt', tagName: 'previous_output'},
        historyReads: [],
        blocks: [
          {
            id: makeId(),
            label: 'Instructions',
            tagName: 'system',
            body: 'Extract explicit constraints from the prompt below.\nRespond with JSON only:\n{ "must": string[], "must_not": string[], "preferences": string[] }',
            enabled: true,
            source: 'system-default',
          },
        ],
      },
    },
  ],
};

export const SUGGESTION_PROMPT_REWRITE: PipelineSuggestion = {
  id: 'suggestion-prompt-rewrite',
  name: 'Prompt Rewrite',
  description: 'Rewrite the previous output or user prompt in a clearer, more structured style.',
  category: 'rewrite',
  preferredModelBucket: 'rewrite',
  requiredBindings: [],
  outputHints: [{stepId: 'prompt-rewrite', outputName: 'text', description: 'Rewritten prompt text'}],
  insertableSteps: [
    {
      id: 'prompt-rewrite',
      type: 'model-call',
      label: 'Prompt Rewrite',
      enabled: true,
      outputNamespace: 'prompt_rewrite',
      primaryOutputName: 'text',
      lastEditedAt: now(),
      config: {
        type: 'model-call',
        modelRef: {kind: 'fixed', endpointId: '', modelName: ''},
        mode: 'generate',
        outputNames: ['text', 'rawResponse'],
      },
      prompt: {
        previousOutput: {enabled: true, placement: 'afterOwnPrompt', tagName: 'previous_output'},
        historyReads: [],
        blocks: [
          {
            id: makeId(),
            label: 'Instructions',
            tagName: 'system',
            body: 'Rewrite the input below to be clearer, more concise, and better structured. Return only the rewritten text with no commentary.',
            enabled: true,
            source: 'system-default',
          },
        ],
      },
    },
  ],
};

export const SUGGESTION_CANDIDATE_ANSWER: PipelineSuggestion = {
  id: 'suggestion-candidate-answer',
  name: 'Candidate Answer',
  description: 'Generate a candidate answer using the prior pipeline context.',
  category: 'generation',
  preferredModelBucket: 'general',
  requiredBindings: [],
  outputHints: [{stepId: 'candidate-answer', outputName: 'text', description: 'Generated candidate answer'}],
  insertableSteps: [
    {
      id: 'candidate-answer',
      type: 'model-call',
      label: 'Candidate Answer',
      enabled: true,
      outputNamespace: 'candidate_answer',
      primaryOutputName: 'text',
      lastEditedAt: now(),
      config: {
        type: 'model-call',
        modelRef: {kind: 'fixed', endpointId: '', modelName: ''},
        mode: 'generate',
        outputNames: ['text', 'rawResponse'],
      },
      prompt: {
        previousOutput: {enabled: true, placement: 'afterOwnPrompt', tagName: 'previous_output'},
        historyReads: [],
        blocks: [
          {
            id: makeId(),
            label: 'Instructions',
            tagName: 'system',
            body: 'Write a complete candidate answer that satisfies the requirements provided. Be thorough and precise.',
            enabled: true,
            source: 'system-default',
          },
        ],
      },
    },
  ],
};

export const SUGGESTION_ANSWER_VERIFICATION: PipelineSuggestion = {
  id: 'suggestion-answer-verification',
  name: 'Answer Verification',
  description: 'Verify a candidate answer against requirements or criteria.',
  category: 'verification',
  preferredModelBucket: 'verify',
  requiredBindings: [],
  outputHints: [{stepId: 'answer-verification', outputName: 'text', description: 'Verification result as JSON'}],
  insertableSteps: [
    {
      id: 'answer-verification',
      type: 'model-call',
      label: 'Answer Verification',
      enabled: true,
      outputNamespace: 'answer_verification',
      primaryOutputName: 'text',
      lastEditedAt: now(),
      config: {
        type: 'model-call',
        modelRef: {kind: 'fixed', endpointId: '', modelName: ''},
        mode: 'generate',
        outputNames: ['text', 'rawResponse'],
      },
      prompt: {
        previousOutput: {enabled: true, placement: 'afterOwnPrompt', tagName: 'candidate_answer'},
        historyReads: [],
        blocks: [
          {
            id: makeId(),
            label: 'Instructions',
            tagName: 'system',
            body: 'Verify whether the answer below satisfies the requirements. Respond with JSON only:\n{ "passed": boolean, "failures": string[], "notes": string }',
            enabled: true,
            source: 'system-default',
          },
        ],
      },
    },
  ],
};

export const SUGGESTION_DRIFT_CHECK: PipelineSuggestion = {
  id: 'suggestion-drift-check',
  name: 'Drift Check',
  description: 'Detect semantic drift between the original prompt and a generated answer.',
  category: 'verification',
  preferredModelBucket: 'verify',
  requiredBindings: [],
  outputHints: [{stepId: 'drift-check', outputName: 'text', description: 'Drift analysis as JSON'}],
  insertableSteps: [
    {
      id: 'drift-check',
      type: 'model-call',
      label: 'Drift Check',
      enabled: true,
      outputNamespace: 'drift_check',
      primaryOutputName: 'text',
      lastEditedAt: now(),
      config: {
        type: 'model-call',
        modelRef: {kind: 'fixed', endpointId: '', modelName: ''},
        mode: 'generate',
        outputNames: ['text', 'rawResponse'],
      },
      prompt: {
        previousOutput: {enabled: true, placement: 'afterOwnPrompt', tagName: 'previous_output'},
        historyReads: [],
        blocks: [
          {
            id: makeId(),
            label: 'Instructions',
            tagName: 'system',
            body: 'Compare the original intent and the current output. Detect meaning drift, omissions, or contradictions.\nRespond with JSON only:\n{ "drifted": boolean, "severity": "none" | "low" | "high", "differences": string[] }',
            enabled: true,
            source: 'system-default',
          },
        ],
      },
    },
  ],
};

export const SUGGESTION_SUMMARY: PipelineSuggestion = {
  id: 'suggestion-summary',
  name: 'Summary',
  description: 'Summarize the previous step output while preserving key facts.',
  category: 'utility',
  preferredModelBucket: 'summarize',
  requiredBindings: [],
  outputHints: [{stepId: 'summary', outputName: 'text', description: 'Compressed summary text'}],
  insertableSteps: [
    {
      id: 'summary',
      type: 'model-call',
      label: 'Summary',
      enabled: true,
      outputNamespace: 'summary',
      primaryOutputName: 'text',
      lastEditedAt: now(),
      config: {
        type: 'model-call',
        modelRef: {kind: 'fixed', endpointId: '', modelName: ''},
        mode: 'generate',
        outputNames: ['text', 'rawResponse'],
      },
      prompt: {
        previousOutput: {enabled: true, placement: 'afterOwnPrompt', tagName: 'source'},
        historyReads: [],
        blocks: [
          {
            id: makeId(),
            label: 'Instructions',
            tagName: 'system',
            body: 'Summarize the following content. Preserve factual claims and omit filler.',
            enabled: true,
            source: 'system-default',
          },
        ],
      },
    },
  ],
};

export const BUILTIN_SUGGESTIONS: PipelineSuggestion[] = [
  SUGGESTION_INTENT_EXTRACTION,
  SUGGESTION_ACCEPTANCE_CRITERIA,
  SUGGESTION_CONSTRAINT_EXTRACTION,
  SUGGESTION_PROMPT_REWRITE,
  SUGGESTION_CANDIDATE_ANSWER,
  SUGGESTION_ANSWER_VERIFICATION,
  SUGGESTION_DRIFT_CHECK,
  SUGGESTION_SUMMARY,
];
