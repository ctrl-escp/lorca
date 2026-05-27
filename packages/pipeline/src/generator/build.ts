import {listStepOutputArtifacts} from '../historyReads.js';
import {validateStepChainBody} from '../stepChainValidation.js';
import type {PipelineStep} from '@lorca/core';
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

function collectArtifactRefsFromSteps(steps: readonly PipelineStep[]): string[] {
  const refs: string[] = [];
  function visit(step: PipelineStep) {
    for (const artifact of listStepOutputArtifacts(step)) refs.push(artifact.ref);
    if (step.config.type === 'loop-group') {
      for (const inner of step.config.steps) visit(inner);
    }
    if (step.config.type === 'capsule-instance' && step.config.inlineSteps?.length) {
      for (const inner of step.config.inlineSteps) visit(inner);
    }
  }
  for (const step of steps) visit(step);
  return refs;
}

export function validateBuiltGeneratorSteps(
  steps: import('@lorca/core').PipelineStep[],
  context: GeneratorBuildContext,
): string[] {
  const extraArtifactRefs = context.applyMode === 'append' && context.existingPipeline
    ? collectArtifactRefsFromSteps(context.existingPipeline.steps)
    : undefined;
  const result = validateStepChainBody(steps, {
    resolveCapsule: context.resolveCapsule,
    ...(extraArtifactRefs?.length ? {extraArtifactRefs} : {}),
  });
  if (result.ok) return [];
  return [result.error.message];
}
