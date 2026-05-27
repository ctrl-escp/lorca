import type {PipelineStep} from '@lorca/core';
import {
  dedupeStepRolePromptTemplates,
  type StepRolePromptTemplate,
} from '@lorca/prompt';
import {ALL_SUGGESTIONS} from './suggestions/index.js';
import {getBuiltinExamples} from './examples/index.js';

const CATEGORY_LABELS: Record<string, string> = {
  extraction: 'Extraction',
  planning: 'Planning',
  generation: 'Generation',
  verification: 'Verification',
  rewrite: 'Rewrite',
  utility: 'Utility',
};

function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

function isSubstantive(text: string): boolean {
  return text.trim().length >= 3;
}

function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

function collectFromSteps(
  steps: readonly PipelineStep[],
  ctx: Pick<StepRolePromptTemplate, 'category' | 'source'>,
  roleForStep: (step: PipelineStep) => string,
  out: StepRolePromptTemplate[],
): void {
  function visit(step: PipelineStep) {
    if (step.type === 'model-call') {
      for (const block of step.prompt?.blocks ?? []) {
        if (!isSubstantive(block.body)) continue;
        out.push({
          id: '',
          role: roleForStep(step),
          category: ctx.category,
          source: ctx.source,
          text: block.body,
        });
      }
    }
    if (step.config.type === 'loop-group') {
      for (const inner of step.config.steps) visit(inner);
    }
  }

  for (const step of steps) visit(step);
}

export interface BuildRolePromptCatalogOptions {
  excludeText?: string;
}

/** Built-in specialized step instruction prompts (suggestions + example capsules). */
export function buildRolePromptCatalog(options?: BuildRolePromptCatalogOptions): StepRolePromptTemplate[] {
  const raw: StepRolePromptTemplate[] = [];

  for (const suggestion of ALL_SUGGESTIONS) {
    const topLevel = suggestion.insertableSteps;
    const singleModelCall = topLevel.length === 1 && topLevel[0]?.type === 'model-call';
    collectFromSteps(
      topLevel,
      {category: categoryLabel(suggestion.category), source: 'suggestion'},
      (step) => (singleModelCall ? suggestion.name : `${suggestion.name} · ${step.label}`),
      raw,
    );
  }

  for (const example of getBuiltinExamples()) {
    collectFromSteps(
      example.steps ?? [],
      {category: 'Example flow', source: 'example'},
      (step) => `${example.name} · ${step.label}`,
      raw,
    );
  }

  const deduped = dedupeStepRolePromptTemplates(raw);
  const exclude = options?.excludeText ? normalizeText(options.excludeText) : null;
  if (!exclude) return deduped;
  return deduped.filter((entry) => normalizeText(entry.text) !== exclude);
}
