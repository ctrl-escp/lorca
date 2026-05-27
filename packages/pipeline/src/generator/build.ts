import {validateStepChainBody} from '../stepChainValidation.js';
import type {
  GeneratorBuildContext,
  GeneratorBuildResult,
  PipelineGeneratorPlan,
} from './types.js';
import {MaterializeState} from './materializeState.js';
import {materializePlan} from './materialize.js';
import {validatePlanCatalogIds} from './validateCatalog.js';

/**
 * Materialize pipeline steps from a parsed generator plan.
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

  const state = new MaterializeState(context, context.existingPipeline);
  errors.push(...materializePlan(plan.steps, state));

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

  const {steps: resolvedSteps, unresolved} = context.resolveModelAssignments({
    steps: state.steps,
    requests: state.modelRequests,
  });

  const validationErrors = validateBuiltGeneratorSteps(resolvedSteps, context);
  errors.push(...validationErrors);

  return {
    ok: errors.length === 0,
    steps: resolvedSteps,
    errors,
    unresolvedModels: unresolved,
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
