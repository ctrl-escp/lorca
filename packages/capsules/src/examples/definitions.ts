import type {CapsuleDefinition} from '@lorca/core';
import {ALL_SUGGESTIONS} from '../suggestions/index.js';
import {buildExampleCapsule, modelCallStep, withAnswerVerifyRetryLoop} from './build.js';
import {PIPELINE_GENERATOR_SYSTEM_PROMPT} from './generatorPrompt.js';

const GENERATOR_SUGGESTION_CATALOG = JSON.stringify(
  ALL_SUGGESTIONS.map((suggestion) => ({
    id: suggestion.id,
    name: suggestion.name,
    category: suggestion.category,
    description: suggestion.description,
    preferredModelBucket: suggestion.preferredModelBucket ?? null,
  })),
  null,
  2,
);

export const LORCA_PIPELINE_GENERATOR_ID = 'lorca-pipeline-generator';

export const LORCA_PIPELINE_GENERATOR: CapsuleDefinition = {
  schemaVersion: 2,
  id: LORCA_PIPELINE_GENERATOR_ID,
  name: 'Lorca Pipeline Generator',
  description: 'Build a Lorca pipeline step sequence from a natural language description.',
  version: 'v1',
  status: 'locked',
  interface: {
    inputs: [
      {
        name: 'description',
        kind: 'text',
        required: true,
        description: 'Natural language description of the pipeline to build.',
      },
    ],
    outputs: [
      {
        name: 'pipeline_steps_json',
        kind: 'json',
        description: 'PipelineGeneratorPlan v1 JSON (schemaVersion 1 wrapper).',
        sourceArtifactKey: 'generate.text',
      },
    ],
    parameters: [],
    modelSlots: [
      {
        name: 'generator',
        suggestedBuckets: [
          'general',
          'thinking',
        ],
        required: true,
        description: 'Model used to plan a pipeline from the description.',
      },
    ],
  },
  steps: [
    modelCallStep({
      id: 'generate',
      label: 'Generate pipeline plan',
      outputNamespace: 'generate',
      slotName: 'generator',
      mode: 'chat',
      temperature: 0.2,
      maxTokens: 4096,
      outputType: 'json',
      previousOutputTag: 'description',
      prompt: PIPELINE_GENERATOR_SYSTEM_PROMPT.replace(
        '{{SUGGESTION_CATALOG}}',
        GENERATOR_SUGGESTION_CATALOG,
      ),
    }),
  ],
  input: {raw: '', tagName: 'user', outputNamespace: 'user_prompt'},
  tests: [],
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
  lockedAt: '2025-01-01T00:00:00.000Z',
};

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
        sourceArtifactKey: 'extract.json',
      },
    ],
    parameters: [],
    modelSlots: [
      {
        name: 'extractor',
        suggestedBuckets: [
          'tiny',
        ],
        required: true,
        description: 'Small model for fast intent extraction',
      },
    ],
  },
  steps: [
    modelCallStep({
      id: 'extract',
      label: 'extract',
      outputNamespace: 'extract',
      slotName: 'extractor',
      outputType: 'json',
      prompt: [
        'Extract the user intent from the prompt below.',
        'Respond with JSON only using this shape:',
        '{ "intent": string, "topics": string[], "confidence": number }',
        '',
        'User prompt:',
        '{{artifact.user_prompt.raw}}',
      ].join('\n'),
    }),
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
        sourceArtifactKey: 'generate.json',
      },
    ],
    parameters: [],
    modelSlots: [
      {
        name: 'generator',
        suggestedBuckets: [
          'thinking',
          'general',
        ],
        required: true,
        description: 'Model for criteria generation',
      },
    ],
  },
  steps: [
    modelCallStep({
      id: 'generate',
      label: 'generate',
      outputNamespace: 'generate',
      slotName: 'generator',
      outputType: 'json',
      prompt: [
        'Generate clear, testable acceptance criteria for the request below.',
        'Respond with JSON only:',
        '{ "criteria": string[], "assumptions": string[] }',
        '',
        '<acceptance_criteria>',
        'Request:',
        '{{artifact.user_prompt.raw}}',
        '</acceptance_criteria>',
      ].join('\n'),
    }),
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
        defaultArtifactKey: 'acceptance_criteria',
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
        suggestedBuckets: [
          'thinking',
          'general',
        ],
        required: true,
        description: 'Primary answer model',
      },
    ],
  },
  steps: [
    modelCallStep({
      id: 'answer',
      label: 'answer',
      outputNamespace: 'answer',
      slotName: 'answer_model',
      prompt: [
        'Write a complete candidate answer that satisfies the acceptance criteria.',
        '',
        'Acceptance criteria:',
        '{{artifact.acceptance_criteria}}',
        '',
        'User request:',
        '{{artifact.user_prompt.raw}}',
      ].join('\n'),
    }),
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
        defaultArtifactKey: 'acceptance_criteria',
      },
      {
        name: 'candidate_answer',
        kind: 'text',
        required: true,
        description: 'Answer to verify',
        defaultArtifactKey: 'candidate_answer',
      },
    ],
    outputs: [
      {
        name: 'verification_result_json',
        kind: 'json',
        description: 'Pass/fail verification result',
        sourceArtifactKey: 'verify.json',
      },
    ],
    parameters: [],
    modelSlots: [
      {
        name: 'verifier',
        suggestedBuckets: [
          'tiny',
          'general',
        ],
        required: true,
        description: 'Model for verification',
      },
    ],
  },
  steps: [
    modelCallStep({
      id: 'verify',
      label: 'verify',
      outputNamespace: 'verify',
      slotName: 'verifier',
      outputType: 'json',
      prompt: [
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
    }),
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
        defaultArtifactKey: 'source_text',
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
        suggestedBuckets: [
          'summarize',
          'tiny',
        ],
        required: true,
        description: 'Summarization model',
      },
    ],
  },
  steps: [
    modelCallStep({
      id: 'summarize',
      label: 'summarize',
      outputNamespace: 'summarize',
      slotName: 'summarizer',
      prompt: [
        'Summarize the following text. Preserve factual claims and omit filler.',
        '',
        'Source:',
        '{{artifact.source_text}}',
      ].join('\n'),
    }),
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
        suggestedBuckets: [
          'general',
        ],
        required: true,
        description: 'Rewrite model',
      },
    ],
  },
  steps: [
    modelCallStep({
      id: 'rewrite',
      label: 'rewrite',
      outputNamespace: 'rewrite',
      slotName: 'rewriter',
      prompt: [
        'Rewrite the user prompt in this style: {{param.style}}',
        'Return only the rewritten prompt with no commentary.',
        '',
        'Original:',
        '{{artifact.user_prompt.raw}}',
      ].join('\n'),
    }),
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
        sourceArtifactKey: 'extract.json',
      },
    ],
    parameters: [],
    modelSlots: [
      {
        name: 'extractor',
        suggestedBuckets: [
          'tiny',
          'general',
        ],
        required: true,
        description: 'Constraint extraction model',
      },
    ],
  },
  steps: [
    modelCallStep({
      id: 'extract',
      label: 'extract',
      outputNamespace: 'extract',
      slotName: 'extractor',
      outputType: 'json',
      prompt: [
        'Extract explicit constraints from the user prompt.',
        'Respond with JSON only:',
        '{ "must": string[], "must_not": string[], "preferences": string[] }',
        '',
        'Prompt:',
        '{{artifact.user_prompt.raw}}',
      ].join('\n'),
    }),
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
        defaultArtifactKey: 'baseline_text',
      },
      {
        name: 'current_text',
        kind: 'text',
        required: true,
        description: 'Revised text to compare',
        defaultArtifactKey: 'current_text',
      },
    ],
    outputs: [
      {
        name: 'drift_result_json',
        kind: 'json',
        description: 'Drift analysis result',
        sourceArtifactKey: 'check.json',
      },
    ],
    parameters: [],
    modelSlots: [
      {
        name: 'checker',
        suggestedBuckets: [
          'tiny',
          'general',
        ],
        required: true,
        description: 'Drift detection model',
      },
    ],
  },
  steps: [
    modelCallStep({
      id: 'check',
      label: 'check',
      outputNamespace: 'check',
      slotName: 'checker',
      outputType: 'json',
      prompt: [
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
    }),
  ],
});

export const EXAMPLE_BEST_OF_TWO = buildExampleCapsule({
  id: 'example-best-of-two',
  name: 'Best of Two',
  description: 'Extract intent, run two independent answer models, and select the strongest result.',
  interface: {
    inputs: [],
    outputs: [
      {
        name: 'best_answer_json',
        kind: 'json',
        description: 'Winner, answer, rationale, and improvement notes',
        sourceArtifactKey: 'choose.json',
      },
    ],
    parameters: [],
    modelSlots: [
      {
        name: 'extractor',
        suggestedBuckets: [
          'extract-json',
          'general',
        ],
        required: true,
        description: 'Model that extracts intent, acceptance criteria, and constraints',
        preferredModelNames: [
          'mistral:7b',
          'hermes3:8b',
          'qwen2.5-coder:7b',
        ],
        preferredFamilies: [
          'mistral',
          'qwen',
        ],
        preferredParameterSizes: [
          '7B',
          '8B',
        ],
      },
      {
        name: 'candidate_a',
        suggestedBuckets: [
          'thinking',
          'general',
        ],
        required: true,
        description: 'First answer model',
        preferredModelNames: [
          'qwen3:8b',
          'llama3.1:8b',
          'llama3.2:3b',
        ],
        preferredFamilies: [
          'qwen',
          'llama',
        ],
        preferredParameterSizes: [
          '8B',
          '7B',
          '3B',
        ],
      },
      {
        name: 'candidate_b',
        suggestedBuckets: [
          'general',
          'thinking',
        ],
        required: true,
        description: 'Second answer model with a different model family when available',
        preferredModelNames: [
          'gemma3:12b',
          'mistral:7b',
          'llama3.1:8b',
        ],
        preferredFamilies: [
          'gemma',
          'mistral',
          'llama',
        ],
        preferredParameterSizes: [
          '12B',
          '8B',
          '7B',
        ],
      },
      {
        name: 'judge',
        suggestedBuckets: [
          'verify',
          'thinking',
          'general',
        ],
        required: true,
        description: 'Model that compares candidate answers against the extracted criteria',
        preferredModelNames: [
          'qwen3:8b',
          'llama3-judgelm:8b',
          'mistral:7b',
        ],
        preferredFamilies: [
          'qwen',
          'llama',
          'mistral',
        ],
        preferredParameterSizes: [
          '8B',
          '7B',
        ],
      },
    ],
  },
  steps: [
    modelCallStep({
      id: 'intent',
      label: 'intent',
      outputNamespace: 'intent',
      slotName: 'extractor',
      temperature: 0.1,
      maxTokens: 1200,
      outputType: 'json',
      prompt: [
        'Analyze the user request as a task brief.',
        'Extract what a high-quality answer must do before anyone tries to answer.',
        'Respond with JSON only using this exact shape:',
        '{',
        '  "intent": string,',
        '  "domain": string,',
        '  "acceptance_criteria": string[],',
        '  "constraints": string[],',
        '  "quality_bar": string[],',
        '  "ambiguities": string[]',
        '}',
        '',
        'Rules:',
        '- Criteria must be observable in a final answer.',
        '- Constraints must include explicit limits, required formats, and user preferences.',
        '- Do not answer the request yet.',
        '',
        'User request:',
        '{{artifact.user_prompt.raw}}',
      ].join('\n'),
    }),
    modelCallStep({
      id: 'candidate_a',
      label: 'candidate a',
      outputNamespace: 'candidate_a',
      slotName: 'candidate_a',
      temperature: 0.35,
      maxTokens: 2400,
      prompt: [
        'Answer the user request. Optimize for usefulness, correctness, and completeness.',
        '',
        'Use this extracted brief as your contract:',
        '{{artifact.intent.json}}',
        '',
        'Answering rules:',
        '- Satisfy every acceptance criterion directly.',
        '- Respect every constraint.',
        '- State assumptions only when they materially affect the answer.',
        '- Prefer concrete steps, examples, and decisions over vague advice.',
        '- Do not mention that you are one of several candidates.',
        '',
        'User request:',
        '{{artifact.user_prompt.raw}}',
      ].join('\n'),
    }),
    modelCallStep({
      id: 'candidate_b',
      label: 'candidate b',
      outputNamespace: 'candidate_b',
      slotName: 'candidate_b',
      temperature: 0.35,
      maxTokens: 2400,
      prompt: [
        'Answer the user request. Optimize for usefulness, correctness, and completeness.',
        '',
        'Use this extracted brief as your contract:',
        '{{artifact.intent.json}}',
        '',
        'Answering rules:',
        '- Satisfy every acceptance criterion directly.',
        '- Respect every constraint.',
        '- State assumptions only when they materially affect the answer.',
        '- Prefer concrete steps, examples, and decisions over vague advice.',
        '- Do not mention that you are one of several candidates.',
        '',
        'User request:',
        '{{artifact.user_prompt.raw}}',
      ].join('\n'),
    }),
    modelCallStep({
      id: 'choose',
      label: 'choose',
      outputNamespace: 'choose',
      slotName: 'judge',
      temperature: 0.1,
      maxTokens: 2200,
      outputType: 'json',
      prompt: [
        'You are a strict answer judge. Compare two candidate answers against the task brief.',
        'Choose the answer that best satisfies the criteria, then produce a polished final answer.',
        'Respond with JSON only using this exact shape:',
        '{',
        '  "winner": "candidate_a" | "candidate_b" | "merged",',
        '  "best_answer": string,',
        '  "rationale": string,',
        '  "criterion_scores": { "criterion": string, "candidate_a": number, "candidate_b": number }[],',
        '  "remaining_risks": string[]',
        '}',
        '',
        'Scoring rules:',
        '- Score each criterion from 0 to 5.',
        '- Penalize hallucinated facts, ignored constraints, and answers that sound confident without support.',
        '- Use "merged" only when combining non-conflicting strengths clearly improves the result.',
        '',
        'Task brief:',
        '{{artifact.intent.json}}',
        '',
        'User request:',
        '{{artifact.user_prompt.raw}}',
        '',
        'Candidate A:',
        '{{artifact.candidate_a.text}}',
        '',
        'Candidate B:',
        '{{artifact.candidate_b.text}}',
      ].join('\n'),
    }),
  ],
});

export const EXAMPLE_EXPERT = withAnswerVerifyRetryLoop(buildExampleCapsule({
  id: 'example-expert',
  name: 'The Expert',
  description: 'Route the prompt to a domain expert, answer it, and verify the answer against criteria. Retries up to 3 times until verification passes.',
  interface: {
    inputs: [],
    outputs: [
      {
        name: 'expert_answer',
        kind: 'text',
        description: 'Domain-grounded answer',
        sourceArtifactKey: 'answer.text',
      },
      {
        name: 'verification_json',
        kind: 'json',
        description: 'Verification result for the expert answer',
        sourceArtifactKey: 'verify.json',
      },
    ],
    parameters: [],
    modelSlots: [
      {
        name: 'domain_router',
        suggestedBuckets: [
          'extract-json',
          'tiny',
          'general',
        ],
        required: true,
        description: 'Model that identifies the domain and required expertise',
        preferredModelNames: [
          'mistral:7b',
          'llama3.2:3b',
          'hermes3:8b',
        ],
        preferredFamilies: [
          'mistral',
          'llama',
        ],
        preferredParameterSizes: [
          '7B',
          '3B',
          '8B',
        ],
      },
      {
        name: 'expert_planner',
        suggestedBuckets: [
          'thinking',
          'extract-json',
          'general',
        ],
        required: true,
        description: 'Model that turns the domain into intent and acceptance criteria',
        preferredModelNames: [
          'qwen3:8b',
          'mistral:7b',
          'qwen2.5:7b',
        ],
        preferredFamilies: [
          'qwen',
          'mistral',
        ],
        preferredParameterSizes: [
          '8B',
          '7B',
        ],
      },
      {
        name: 'expert_answerer',
        suggestedBuckets: [
          'thinking',
          'general',
        ],
        required: true,
        description: 'Model that answers as the selected expert',
        preferredModelNames: [
          'qwen3:8b',
          'gemma3:12b',
          'llama3.1:8b',
        ],
        preferredFamilies: [
          'qwen',
          'gemma',
          'llama',
        ],
        preferredParameterSizes: [
          '8B',
          '12B',
          '7B',
        ],
      },
      {
        name: 'verifier',
        suggestedBuckets: [
          'verify',
          'extract-json',
          'general',
        ],
        required: true,
        description: 'Model that verifies the answer against acceptance criteria',
        preferredModelNames: [
          'qwen3:8b',
          'llama3-judgelm:8b',
          'mistral:7b',
        ],
        preferredFamilies: [
          'qwen',
          'llama',
          'mistral',
        ],
        preferredParameterSizes: [
          '8B',
          '7B',
        ],
      },
    ],
  },
  steps: [
    modelCallStep({
      id: 'domain',
      label: 'domain',
      outputNamespace: 'domain',
      slotName: 'domain_router',
      temperature: 0.1,
      maxTokens: 900,
      outputType: 'json',
      prompt: [
        'Identify the expert domain needed to answer the user request.',
        'Respond with JSON only:',
        '{ "domain": string, "expert_role": string, "knowledge_needed": string[], "risk_flags": string[] }',
        '',
        'Prefer a concrete expert role, such as "senior frontend engineer" or "employment attorney".',
        'Use risk_flags for uncertainty, safety, legal, medical, financial, or missing-context concerns.',
        '',
        'User request:',
        '{{artifact.user_prompt.raw}}',
      ].join('\n'),
    }),
    modelCallStep({
      id: 'plan',
      label: 'plan',
      outputNamespace: 'plan',
      slotName: 'expert_planner',
      temperature: 0.1,
      maxTokens: 1400,
      outputType: 'json',
      prompt: [
        'You are acting as this expert:',
        '{{artifact.domain.json}}',
        '',
        'Extract the intent and acceptance criteria for answering the user request well.',
        'Respond with JSON only:',
        '{',
        '  "intent": string,',
        '  "acceptance_criteria": string[],',
        '  "constraints": string[],',
        '  "must_cover": string[],',
        '  "answer_style": string',
        '}',
        '',
        'Criteria must be specific enough that a verifier can check the final answer.',
        '',
        'User request:',
        '{{artifact.user_prompt.raw}}',
      ].join('\n'),
    }),
    modelCallStep({
      id: 'answer',
      label: 'Answer as expert',
      outputNamespace: 'answer',
      slotName: 'expert_answerer',
      temperature: 0.25,
      maxTokens: 2600,
      prompt: [
        'Answer as the selected expert. Be direct, practical, and careful.',
        '',
        'Expert domain:',
        '{{artifact.domain.json}}',
        '',
        'Answer contract:',
        '{{artifact.plan.json}}',
        '',
        'Rules:',
        '- Cover every must_cover item and acceptance criterion.',
        '- Respect constraints and the requested answer_style.',
        '- Name assumptions and uncertainty instead of inventing facts.',
        '- For high-stakes domains, provide general information and recommend qualified professional help where appropriate.',
        '',
        'User request:',
        '{{artifact.user_prompt.raw}}',
      ].join('\n'),
    }),
    modelCallStep({
      id: 'verify',
      label: 'verify',
      outputNamespace: 'verify',
      slotName: 'verifier',
      temperature: 0.1,
      maxTokens: 1400,
      outputType: 'json',
      prompt: [
        'Verify the expert answer against the extracted contract.',
        'Respond with JSON only:',
        '{ "passed": boolean, "missing": string[], "weak_spots": string[], "repair_suggestions": string[], "confidence": number }',
        '',
        'A pass requires every acceptance criterion to be addressed in the answer.',
        'Set confidence from 0 to 1.',
        '',
        'Expert domain:',
        '{{artifact.domain.json}}',
        '',
        'Answer contract:',
        '{{artifact.plan.json}}',
        '',
        'Expert answer:',
        '{{artifact.answer.text}}',
      ].join('\n'),
    }),
  ],
}));

export const BUILTIN_EXAMPLES: CapsuleDefinition[] = [
  LORCA_PIPELINE_GENERATOR,
  EXAMPLE_INTENT_EXTRACTION,
  EXAMPLE_ACCEPTANCE_CRITERIA,
  EXAMPLE_CANDIDATE_ANSWER,
  EXAMPLE_ANSWER_VERIFICATION,
  EXAMPLE_SUMMARY,
  EXAMPLE_PROMPT_REWRITE,
  EXAMPLE_CONSTRAINT_EXTRACTION,
  EXAMPLE_DRIFT_CHECK,
  EXAMPLE_BEST_OF_TWO,
  EXAMPLE_EXPERT,
];

export const BUILTIN_EXAMPLE_IDS = BUILTIN_EXAMPLES.map((c) => c.id);
