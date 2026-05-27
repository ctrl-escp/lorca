/** Compact example for the generator system prompt (not executed — illustration only). */
export const PIPELINE_GENERATOR_EXAMPLE_PLAN = {
  schemaVersion: 1,
  assumptions: ['Multi-role debate with one retry loop'],
  steps: [
    {
      kind: 'custom',
      stepKey: 'hypothesis',
      label: 'Extract hypothesis',
      prompt: {mode: 'custom', text: 'Extract a testable hypothesis from the question.'},
      modelBucket: 'general',
    },
    {
      kind: 'custom',
      stepKey: 'expert_pro',
      label: 'Expert — support',
      prompt: {mode: 'custom', text: 'Argue for the hypothesis.'},
      historyReads: [{ref: 'generated:hypothesis.text', tagName: 'hypothesis'}],
      modelBucket: 'thinking',
    },
    {
      kind: 'loop',
      stepKey: 'round_two',
      label: 'Second round',
      maxIterations: 1,
      exitCondition: {type: 'iterations'},
      steps: [
        {
          kind: 'custom',
          stepKey: 'expert_pro_r2',
          label: 'Pro — refine',
          prompt: {mode: 'custom', text: 'Improve your argument.'},
          historyReads: [{ref: 'generated:expert_pro.text', tagName: 'pro'}],
        },
      ],
    },
    {
      kind: 'presentation',
      stepKey: 'summary',
      label: 'Summary',
      text: 'Result: {{generated:hypothesis.text}}\n\n{{generated:round_two.text}}',
    },
  ],
} as const;
