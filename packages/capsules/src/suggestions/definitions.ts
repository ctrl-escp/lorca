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
        previousOutput: {enabled: true, placement: 'afterOwnPrompt', tagName: 'user_request'},
        historyReads: [],
        blocks: [
          {
            id: makeId(),
            label: 'Instructions',
            tagName: 'system',
            body: `You are an intent extractor. Read the user's request in <user_request> and identify what they are trying to accomplish.

Rules:
- intent: one concise sentence (≤20 words) describing the core goal
- topics: 1-5 short noun phrases (e.g. "sorting algorithms", "TypeScript")
- confidence: float 0.0-1.0; use ≤0.3 if the request is ambiguous
- If the request is unclear or empty, still return valid JSON with low confidence

Respond with JSON only, no commentary, no markdown fences:
{ "intent": string, "topics": string[], "confidence": number }`,
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
        previousOutput: {enabled: true, placement: 'afterOwnPrompt', tagName: 'user_request'},
        historyReads: [
          {
            sourceStepId: 'intent-extraction',
            sourceArtifactRef: 'intent_extraction.text',
            tagName: 'intent_analysis',
            required: false,
          },
        ],
        blocks: [
          {
            id: makeId(),
            label: 'Instructions',
            tagName: 'system',
            body: `You are a requirements analyst. Generate testable acceptance criteria for the request in <user_request>.

If <intent_analysis> is present, use it to sharpen your understanding of scope.

Rules:
- criteria: up to 8 items; each a testable boolean starting with "The output..." or "The system..."
- assumptions: things NOT stated explicitly but assumed to be true
- Return [] for any empty array; never return null

Respond with JSON only, no commentary, no markdown fences:
{ "criteria": string[], "assumptions": string[] }`,
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
        previousOutput: {enabled: true, placement: 'afterOwnPrompt', tagName: 'user_request'},
        historyReads: [],
        blocks: [
          {
            id: makeId(),
            label: 'Instructions',
            tagName: 'system',
            body: `You are a constraint extractor. Identify explicit constraints in the request found in <user_request>.

Rules:
- must: hard requirements; use imperative verbs ("Use X", "Include Y")
- must_not: hard prohibitions ("Do not use Z", "Avoid W")
- preferences: nice-to-haves, not hard constraints
- Return [] for any empty array; never return null

Respond with JSON only, no commentary, no markdown fences:
{ "must": string[], "must_not": string[], "preferences": string[] }`,
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
        previousOutput: {enabled: true, placement: 'afterOwnPrompt', tagName: 'content_to_rewrite'},
        historyReads: [],
        blocks: [
          {
            id: makeId(),
            label: 'Instructions',
            tagName: 'system',
            body: `You are a prompt engineer. Rewrite the content in <content_to_rewrite> to be clearer, more concise, and better structured for use in an LLM pipeline.

Rules:
- Preserve all constraints, requirements, and factual claims
- Remove hedging, filler, and conversational preamble
- Do NOT add any preamble to your response
- Do NOT wrap the output in XML tags
- Output the rewritten text only`,
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
        previousOutput: {enabled: false, placement: 'afterOwnPrompt', tagName: 'previous_output'},
        historyReads: [
          {
            sourceStepId: 'pipeline-input',
            sourceArtifactRef: 'user_prompt.xml',
            tagName: 'task',
            required: true,
          },
          {
            sourceStepId: 'acceptance-criteria',
            sourceArtifactRef: 'acceptance_criteria.text',
            tagName: 'acceptance_criteria',
            required: false,
          },
          {
            sourceStepId: 'constraint-extraction',
            sourceArtifactRef: 'constraint_extraction.text',
            tagName: 'constraints',
            required: false,
          },
          {
            sourceStepId: 'prompt-rewrite',
            sourceArtifactRef: 'prompt_rewrite.text',
            tagName: 'refined_task',
            required: false,
          },
        ],
        blocks: [
          {
            id: makeId(),
            label: 'Instructions',
            tagName: 'system',
            body: `You are a careful, thorough responder. Write a complete answer to the task described in <task> (use <refined_task> instead if present — it is a clarified version of the same request).

Rules:
- If <acceptance_criteria> is present, address each criterion explicitly
- If <constraints> is present, honour every must/must_not item
- Match the format implied by the criteria (JSON, prose, code, etc.)
- Be specific — avoid vague or hedged language`,
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
        historyReads: [
          {
            sourceStepId: 'acceptance-criteria',
            sourceArtifactRef: 'acceptance_criteria.text',
            tagName: 'acceptance_criteria',
            required: false,
          },
          {
            sourceStepId: 'pipeline-input',
            sourceArtifactRef: 'user_prompt.xml',
            tagName: 'original_request',
            required: false,
          },
        ],
        blocks: [
          {
            id: makeId(),
            label: 'Instructions',
            tagName: 'system',
            body: `You are a strict verifier. Evaluate whether the answer in <candidate_answer> satisfies the requirements.

Check against <acceptance_criteria> if present; otherwise check against <original_request>.

Rules:
- passed: true only if ALL criteria are met
- failures: list each unsatisfied criterion (empty array if passed)
- notes: one sentence overall assessment

Respond with JSON only, no commentary, no markdown fences:
{ "passed": boolean, "failures": string[], "notes": string }`,
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
        previousOutput: {enabled: true, placement: 'afterOwnPrompt', tagName: 'output_to_review'},
        historyReads: [
          {
            sourceStepId: 'intent-extraction',
            sourceArtifactRef: 'intent_extraction.text',
            tagName: 'original_intent',
            required: false,
          },
          {
            sourceStepId: 'pipeline-input',
            sourceArtifactRef: 'user_prompt.xml',
            tagName: 'original_request',
            required: false,
          },
        ],
        blocks: [
          {
            id: makeId(),
            label: 'Instructions',
            tagName: 'system',
            body: `You are a semantic drift detector. Compare the output in <output_to_review> against the original intent.

Use <original_intent> as the reference if present; otherwise use <original_request>.

Rules:
- drifted: true if the output omits, contradicts, or significantly changes the original intent
- severity: "none" | "minor" | "significant" | "critical"
- differences: list SPECIFIC claims or requirements that diverge ([] if none)

Respond with JSON only, no commentary, no markdown fences:
{ "drifted": boolean, "severity": "none" | "minor" | "significant" | "critical", "differences": string[] }`,
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
        previousOutput: {enabled: true, placement: 'afterOwnPrompt', tagName: 'source_content'},
        historyReads: [],
        blocks: [
          {
            id: makeId(),
            label: 'Instructions',
            tagName: 'system',
            body: `You are a precise summariser. Compress the content in <source_content> into a concise summary.

Rules:
- Target length: 3-5 sentences or one short paragraph
- Preserve: numbers, proper nouns, decisions, and conclusions
- Omit: hedging language, repetition, meta-commentary
- Output the summary text only, no preamble`,
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
