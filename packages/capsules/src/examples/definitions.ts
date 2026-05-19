import type {CapsuleDefinition} from '@lorca/core';
import {buildExampleCapsule} from './build.js';

const INPUT_NODE = {id: 'input', type: 'input' as const};

export const EXAMPLE_INTENT_EXTRACTION = buildExampleCapsule({
  id: 'example-intent-extraction',
  name: 'Intent Extraction',
  description: 'Extract structured intent and topics from the user prompt.',
  interface: {
    inputs: [],
    outputs: [
      {
        name: 'intent_json',
        kind: 'json',
        description: 'Parsed intent object',
        sourceArtifactKey: 'parse.json',
      },
    ],
    parameters: [],
    modelSlots: [
      {
        name: 'extractor',
        suggestedBuckets: ['tiny'],
        required: true,
        description: 'Small model for fast intent extraction',
      },
    ],
  },
  nodes: [
    INPUT_NODE,
    {
      id: 'prompt',
      type: 'template',
      artifactPrefix: 'prompt',
      template: [
        'Extract the user intent from the prompt below.',
        'Respond with JSON only using this shape:',
        '{ "intent": string, "topics": string[], "confidence": number }',
        '',
        'User prompt:',
        '{{artifact.user_prompt.raw}}',
      ].join('\n'),
    },
    {
      id: 'extract',
      type: 'model-call',
      artifactPrefix: 'extract',
      config: {
        modelRef: {kind: 'slot', slotName: 'extractor'},
        mode: 'generate',
        inputArtifactRef: 'prompt.text',
        expectedOutput: 'json',
      },
    },
    {
      id: 'parse',
      type: 'json-extract',
      artifactPrefix: 'parse',
      inputArtifactRef: 'extract.text',
    },
  ],
});

export const EXAMPLE_ACCEPTANCE_CRITERIA = buildExampleCapsule({
  id: 'example-acceptance-criteria',
  name: 'Acceptance Criteria Generation',
  description: 'Generate testable acceptance criteria from a user prompt.',
  interface: {
    inputs: [],
    outputs: [
      {
        name: 'acceptance_criteria_json',
        kind: 'json',
        description: 'Structured acceptance criteria',
        sourceArtifactKey: 'parse.json',
      },
    ],
    parameters: [],
    modelSlots: [
      {
        name: 'generator',
        suggestedBuckets: ['thinking', 'general'],
        required: true,
        description: 'Model for criteria generation',
      },
    ],
  },
  nodes: [
    INPUT_NODE,
    {
      id: 'prompt',
      type: 'template',
      artifactPrefix: 'prompt',
      template: [
        'Generate clear, testable acceptance criteria for the request below.',
        'Respond with JSON only:',
        '{ "criteria": string[], "assumptions": string[] }',
        '',
        '<acceptance_criteria>',
        'Request:',
        '{{artifact.user_prompt.raw}}',
        '</acceptance_criteria>',
      ].join('\n'),
    },
    {
      id: 'generate',
      type: 'model-call',
      artifactPrefix: 'generate',
      config: {
        modelRef: {kind: 'slot', slotName: 'generator'},
        mode: 'generate',
        inputArtifactRef: 'prompt.text',
        expectedOutput: 'json',
      },
    },
    {
      id: 'parse',
      type: 'json-extract',
      artifactPrefix: 'parse',
      inputArtifactRef: 'generate.text',
    },
  ],
});

export const EXAMPLE_CANDIDATE_ANSWER = buildExampleCapsule({
  id: 'example-candidate-answer',
  name: 'Candidate Answer Generation',
  description: 'Produce a candidate answer using the user prompt and acceptance criteria.',
  interface: {
    inputs: [
      {
        name: 'acceptance_criteria',
        kind: 'json',
        required: true,
        description: 'Acceptance criteria JSON from a prior step',
      },
    ],
    outputs: [
      {
        name: 'candidate_answer',
        kind: 'text',
        description: 'Generated answer text',
        sourceArtifactKey: 'answer.text',
      },
    ],
    parameters: [],
    modelSlots: [
      {
        name: 'answer_model',
        suggestedBuckets: ['thinking', 'general'],
        required: true,
        description: 'Primary answer model',
      },
    ],
  },
  nodes: [
    INPUT_NODE,
    {
      id: 'prompt',
      type: 'template',
      artifactPrefix: 'prompt',
      template: [
        'Write a complete candidate answer that satisfies the acceptance criteria.',
        '',
        'Acceptance criteria:',
        '{{artifact.acceptance_criteria}}',
        '',
        'User request:',
        '{{artifact.user_prompt.raw}}',
      ].join('\n'),
    },
    {
      id: 'answer',
      type: 'model-call',
      artifactPrefix: 'answer',
      config: {
        modelRef: {kind: 'slot', slotName: 'answer_model'},
        mode: 'generate',
        inputArtifactRef: 'prompt.text',
      },
    },
  ],
});

export const EXAMPLE_ANSWER_VERIFICATION = buildExampleCapsule({
  id: 'example-answer-verification',
  name: 'Candidate Answer Verification',
  description: 'Verify a candidate answer against acceptance criteria.',
  interface: {
    inputs: [
      {
        name: 'acceptance_criteria',
        kind: 'json',
        required: true,
        description: 'Criteria to verify against',
      },
      {
        name: 'candidate_answer',
        kind: 'text',
        required: true,
        description: 'Answer to verify',
      },
    ],
    outputs: [
      {
        name: 'verification_result_json',
        kind: 'json',
        description: 'Pass/fail verification result',
        sourceArtifactKey: 'parse.json',
      },
    ],
    parameters: [],
    modelSlots: [
      {
        name: 'verifier',
        suggestedBuckets: ['tiny', 'general'],
        required: true,
        description: 'Model for verification',
      },
    ],
  },
  nodes: [
    INPUT_NODE,
    {
      id: 'prompt',
      type: 'template',
      artifactPrefix: 'prompt',
      template: [
        'Verify whether the candidate answer satisfies every acceptance criterion.',
        'Respond with JSON only:',
        '{ "passed": boolean, "failures": string[], "notes": string }',
        '',
        'Acceptance criteria:',
        '{{artifact.acceptance_criteria}}',
        '',
        'Candidate answer:',
        '{{artifact.candidate_answer}}',
      ].join('\n'),
    },
    {
      id: 'verify',
      type: 'model-call',
      artifactPrefix: 'verify',
      config: {
        modelRef: {kind: 'slot', slotName: 'verifier'},
        mode: 'generate',
        inputArtifactRef: 'prompt.text',
        expectedOutput: 'json',
      },
    },
    {
      id: 'parse',
      type: 'json-extract',
      artifactPrefix: 'parse',
      inputArtifactRef: 'verify.text',
    },
  ],
});

export const EXAMPLE_SUMMARY = buildExampleCapsule({
  id: 'example-summary',
  name: 'Summary Generation',
  description: 'Summarize source text while preserving key facts.',
  interface: {
    inputs: [
      {
        name: 'source_text',
        kind: 'text',
        required: true,
        description: 'Text to summarize',
      },
    ],
    outputs: [
      {
        name: 'summary',
        kind: 'text',
        description: 'Compressed summary',
        sourceArtifactKey: 'summarize.text',
      },
    ],
    parameters: [],
    modelSlots: [
      {
        name: 'summarizer',
        suggestedBuckets: ['summarize', 'tiny'],
        required: true,
        description: 'Summarization model',
      },
    ],
  },
  nodes: [
    INPUT_NODE,
    {
      id: 'prompt',
      type: 'template',
      artifactPrefix: 'prompt',
      template: [
        'Summarize the following text. Preserve factual claims and omit filler.',
        '',
        'Source:',
        '{{artifact.source_text}}',
      ].join('\n'),
    },
    {
      id: 'summarize',
      type: 'model-call',
      artifactPrefix: 'summarize',
      config: {
        modelRef: {kind: 'slot', slotName: 'summarizer'},
        mode: 'generate',
        inputArtifactRef: 'prompt.text',
      },
    },
  ],
});

export const EXAMPLE_PROMPT_REWRITE = buildExampleCapsule({
  id: 'example-prompt-rewrite',
  name: 'Prompt Rewrite',
  description: 'Rewrite the user prompt in a requested style.',
  interface: {
    inputs: [],
    outputs: [
      {
        name: 'rewritten_prompt',
        kind: 'text',
        description: 'Rewritten user prompt',
        sourceArtifactKey: 'rewrite.text',
      },
    ],
    parameters: [
      {
        name: 'style',
        kind: 'text',
        required: true,
        description: 'Rewrite style (e.g. concise, formal, step-by-step)',
        default: 'concise',
      },
    ],
    modelSlots: [
      {
        name: 'rewriter',
        suggestedBuckets: ['general'],
        required: true,
        description: 'Rewrite model',
      },
    ],
  },
  nodes: [
    INPUT_NODE,
    {
      id: 'prompt',
      type: 'template',
      artifactPrefix: 'prompt',
      template: [
        'Rewrite the user prompt in this style: {{param.style}}',
        'Return only the rewritten prompt with no commentary.',
        '',
        'Original:',
        '{{artifact.user_prompt.raw}}',
      ].join('\n'),
    },
    {
      id: 'rewrite',
      type: 'model-call',
      artifactPrefix: 'rewrite',
      config: {
        modelRef: {kind: 'slot', slotName: 'rewriter'},
        mode: 'generate',
        inputArtifactRef: 'prompt.text',
      },
    },
  ],
});

export const EXAMPLE_CONSTRAINT_EXTRACTION = buildExampleCapsule({
  id: 'example-constraint-extraction',
  name: 'Constraint Extraction',
  description: 'Extract explicit constraints and requirements from a user prompt.',
  interface: {
    inputs: [],
    outputs: [
      {
        name: 'constraints_json',
        kind: 'json',
        description: 'Extracted constraints',
        sourceArtifactKey: 'parse.json',
      },
    ],
    parameters: [],
    modelSlots: [
      {
        name: 'extractor',
        suggestedBuckets: ['tiny', 'general'],
        required: true,
        description: 'Constraint extraction model',
      },
    ],
  },
  nodes: [
    INPUT_NODE,
    {
      id: 'prompt',
      type: 'template',
      artifactPrefix: 'prompt',
      template: [
        'Extract explicit constraints from the user prompt.',
        'Respond with JSON only:',
        '{ "must": string[], "must_not": string[], "preferences": string[] }',
        '',
        'Prompt:',
        '{{artifact.user_prompt.raw}}',
      ].join('\n'),
    },
    {
      id: 'extract',
      type: 'model-call',
      artifactPrefix: 'extract',
      config: {
        modelRef: {kind: 'slot', slotName: 'extractor'},
        mode: 'generate',
        inputArtifactRef: 'prompt.text',
        expectedOutput: 'json',
      },
    },
    {
      id: 'parse',
      type: 'json-extract',
      artifactPrefix: 'parse',
      inputArtifactRef: 'extract.text',
    },
  ],
});

export const EXAMPLE_DRIFT_CHECK = buildExampleCapsule({
  id: 'example-drift-check',
  name: 'Drift Check',
  description: 'Detect semantic drift between a baseline and current text.',
  interface: {
    inputs: [
      {
        name: 'baseline_text',
        kind: 'text',
        required: true,
        description: 'Original reference text',
      },
      {
        name: 'current_text',
        kind: 'text',
        required: true,
        description: 'Revised text to compare',
      },
    ],
    outputs: [
      {
        name: 'drift_result_json',
        kind: 'json',
        description: 'Drift analysis result',
        sourceArtifactKey: 'parse.json',
      },
    ],
    parameters: [],
    modelSlots: [
      {
        name: 'checker',
        suggestedBuckets: ['tiny', 'general'],
        required: true,
        description: 'Drift detection model',
      },
    ],
  },
  nodes: [
    INPUT_NODE,
    {
      id: 'prompt',
      type: 'template',
      artifactPrefix: 'prompt',
      template: [
        'Compare baseline and current text. Detect meaning drift, omissions, or contradictions.',
        'Respond with JSON only:',
        '{ "drifted": boolean, "severity": "none" | "low" | "high", "differences": string[] }',
        '',
        'Baseline:',
        '{{artifact.baseline_text}}',
        '',
        'Current:',
        '{{artifact.current_text}}',
      ].join('\n'),
    },
    {
      id: 'check',
      type: 'model-call',
      artifactPrefix: 'check',
      config: {
        modelRef: {kind: 'slot', slotName: 'checker'},
        mode: 'generate',
        inputArtifactRef: 'prompt.text',
        expectedOutput: 'json',
      },
    },
    {
      id: 'parse',
      type: 'json-extract',
      artifactPrefix: 'parse',
      inputArtifactRef: 'check.text',
    },
  ],
});

export const BUILTIN_EXAMPLES: CapsuleDefinition[] = [
  EXAMPLE_INTENT_EXTRACTION,
  EXAMPLE_ACCEPTANCE_CRITERIA,
  EXAMPLE_CANDIDATE_ANSWER,
  EXAMPLE_ANSWER_VERIFICATION,
  EXAMPLE_SUMMARY,
  EXAMPLE_PROMPT_REWRITE,
  EXAMPLE_CONSTRAINT_EXTRACTION,
  EXAMPLE_DRIFT_CHECK,
];

export const BUILTIN_EXAMPLE_IDS = BUILTIN_EXAMPLES.map((c) => c.id);
