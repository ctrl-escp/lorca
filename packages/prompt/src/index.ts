// Prompt envelope generation, template rendering, and escaping are implemented in Phase 4.
// Reserved XML tags (must not be redefined):
export const RESERVED_TAGS = [
  'user_prompt',
  'system_prompt',
  'pipeline_context',
  'model_output',
  'acceptance_criteria',
  'candidate_answer',
  'verification_result',
] as const;

export type ReservedTag = (typeof RESERVED_TAGS)[number];

export const TAG_PATTERN = /^[a-z][a-z0-9_\-]*$/;
