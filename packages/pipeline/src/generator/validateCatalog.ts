import type {GeneratorBuildContext, GeneratorPlanEntry} from './types.js';

function visitEntries(
  entries: readonly GeneratorPlanEntry[],
  context: GeneratorBuildContext,
  errors: string[],
): void {
  for (const entry of entries) {
    if (entry.kind === 'suggestion') {
      if (context.instantiateSuggestion(entry.suggestionId, new Set(), []) === null) {
        errors.push(`Unknown suggestionId: ${entry.suggestionId}`);
      }
      const prompt = entry.prompt;
      if (prompt?.mode === 'catalog' && prompt.rolePromptId) {
        if (!context.getRolePrompt(prompt.rolePromptId)) {
          errors.push(`Unknown rolePromptId: ${prompt.rolePromptId}`);
        }
      }
    }

    if (entry.kind === 'custom') {
      const prompt = entry.prompt;
      if (prompt?.mode === 'catalog' && prompt.rolePromptId) {
        if (!context.getRolePrompt(prompt.rolePromptId)) {
          errors.push(`Unknown rolePromptId: ${prompt.rolePromptId}`);
        }
      }
      if (prompt?.mode === 'custom' && !prompt.text?.trim()) {
        errors.push(`Custom step "${entry.stepKey}" requires prompt.text`);
      }
    }

    if (entry.kind === 'capsule' && !context.allowCapsules) {
      errors.push(`Capsule step "${entry.stepKey}" is not allowed`);
    }

    if (entry.kind === 'loop') {
      visitEntries(entry.steps, context, errors);
    }
  }
}

/** Resolve catalog ids via injected resolvers before materialization. */
export function validatePlanCatalogIds(
  entries: readonly GeneratorPlanEntry[],
  context: GeneratorBuildContext,
): string[] {
  const errors: string[] = [];
  visitEntries(entries, context, errors);
  return errors;
}
