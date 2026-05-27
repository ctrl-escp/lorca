import {validateStepChainBody} from '../stepChainValidation.js';
import type {
  GeneratorBuildContext,
  GeneratorBuildResult,
  PipelineGeneratorPlan,
} from './types.js';
import {validatePlanCatalogIds} from './validateCatalog.js';

/**
 * Materialize pipeline steps from a parsed generator plan.
 * Phase 2 will implement full entry materialization.
 */
export function buildStepsFromGeneratorPlan(
  plan: PipelineGeneratorPlan,
  context: GeneratorBuildContext,
): GeneratorBuildResult {
  const assumptions = plan.assumptions ?? [];
  const warnings = [...(plan.warnings ?? [])];
  const errors: string[] = [];

  if (plan.steps.length === 0) {
    return {
      ok: true,
      steps: [],
      errors: [],
      unresolvedModels: [],
      assumptions,
      warnings,
    };
  }

  errors.push(...validatePlanCatalogIds(plan.steps, context));
  if (errors.length > 0) {
    return {
      ok: false,
      steps: [],
      errors,
      unresolvedModels: [],
      assumptions,
      warnings,
    };
  }

  errors.push('Step builder for plan entries is not implemented yet (Phase 2)');

  return {
    ok: false,
    steps: [],
    errors,
    unresolvedModels: [],
    assumptions,
    warnings,
  };
}

export function validateBuiltGeneratorSteps(
  steps: import('@lorca/core').PipelineStep[],
  context: GeneratorBuildContext,
): string[] {
  const result = validateStepChainBody(steps, {
    resolveCapsule: context.resolveCapsule,
  });
  if (result.ok) return [];
  return [result.error.message];
}
