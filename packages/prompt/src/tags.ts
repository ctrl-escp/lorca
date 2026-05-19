export const TAG_PATTERN = /^[a-z][a-z0-9_-]*$/;

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

export function isValidTag(tag: string): boolean {
  return TAG_PATTERN.test(tag);
}

export function isReservedTag(tag: string): boolean {
  return (RESERVED_TAGS as readonly string[]).includes(tag);
}
