import type {CapsuleDefinition, PipelineDefinition, PipelineError, PipelineStep, Result} from '@lorca/core';
import {
  LOOP_PREV_ARTIFACT_REF,
  LOOP_PREV_STEP_ID,
  PIPELINE_INPUT_STEP_ID,
} from '@lorca/core';
import {ok, err} from '@lorca/core';
import {
  artifactsForSourceStep,
  getStepHistoryReads,
  listPipelineInputArtifacts,
  listStepOutputArtifacts,
  validateHistoryRead,
} from './historyReads.js';

const ARTIFACT_PLACEHOLDER_RE = /\\?\{\{artifact\.([\w.\-]+)\}\}/g;

export interface ValidateStepChainOptions {
  extraArtifactRefs?: readonly string[];
  resolveCapsule?: (capsuleId: string, capsuleVersion: string) => CapsuleDefinition | undefined;
}

function baseArtifactRefs(extraArtifactRefs?: readonly string[]): Set<string> {
  const refs = new Set(listPipelineInputArtifacts().map((artifact) => artifact.ref));
  for (const ref of extraArtifactRefs ?? []) refs.add(ref);
  return refs;
}

function artifactRefsBeforeStep(
  steps: readonly PipelineStep[],
  stepId: string,
  extraArtifactRefs?: readonly string[],
): Set<string> {
  const refs = baseArtifactRefs(extraArtifactRefs);
  for (const step of steps) {
    if (step.id === stepId) break;
    for (const artifact of listStepOutputArtifacts(step)) refs.add(artifact.ref);
  }
  return refs;
}

function extractArtifactRefsFromTemplate(template: string): string[] {
  const refs: string[] = [];
  const re = new RegExp(ARTIFACT_PLACEHOLDER_RE.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(template)) !== null) {
    if (match[0]!.startsWith('\\')) continue;
    refs.push(match[1]!);
  }
  return refs;
}

function stepProducedArtifactKeys(step: PipelineStep): string[] {
  return listStepOutputArtifacts(step).map((artifact) => artifact.ref);
}

function collectNestedSteps(steps: PipelineStep[], visit: (step: PipelineStep) => void): void {
  for (const step of steps) {
    visit(step);
    if (step.config.type === 'loop-group') collectNestedSteps(step.config.steps, visit);
    if (step.config.type === 'capsule-instance' && step.config.inlineSteps?.length) {
      collectNestedSteps(step.config.inlineSteps, visit);
    }
  }
}

function validateUniqueStepIds(steps: PipelineStep[]): Result<void, PipelineError> {
  const seen = new Set<string>();
  let duplicateId: string | undefined;
  collectNestedSteps(steps, (step) => {
    if (seen.has(step.id)) duplicateId = step.id;
    seen.add(step.id);
  });
  if (duplicateId) {
    return err({
      code: 'invalid_pipeline_graph',
      message: `Duplicate step IDs detected: ${duplicateId}`,
      nodeId: duplicateId,
    });
  }
  return ok(undefined);
}

function validatePrimaryOutputNames(steps: PipelineStep[]): Result<void, PipelineError> {
  for (const step of steps) {
    if (step.config.type === 'capsule-instance') continue;
    const names = (step.config as {outputNames: readonly string[]}).outputNames;
    if (!names.includes(step.primaryOutputName)) {
      return err({
        code: 'invalid_pipeline_graph',
        message: `Step "${step.id}" primaryOutputName "${step.primaryOutputName}" is not in outputNames`,
        nodeId: step.id,
      });
    }
  }
  return ok(undefined);
}

function validateHistoryReadArtifactRef(
  read: {sourceStepId: string; sourceArtifactRef: string},
  chainSteps: PipelineStep[],
): boolean {
  if (read.sourceStepId === PIPELINE_INPUT_STEP_ID) {
    return read.sourceArtifactRef === 'user_prompt.xml' || read.sourceArtifactRef === 'user_prompt.raw';
  }
  if (read.sourceStepId === LOOP_PREV_STEP_ID) {
    return read.sourceArtifactRef === LOOP_PREV_ARTIFACT_REF;
  }
  const options = artifactsForSourceStep(chainSteps, read.sourceStepId);
  return options.some((option) => option.ref === read.sourceArtifactRef);
}

function validateStepHistoryReads(
  step: PipelineStep,
  chainSteps: PipelineStep[],
  allowLoopPrev: boolean,
): Result<void, PipelineError> {
  for (const read of getStepHistoryReads(step)) {
    if (read.sourceStepId === LOOP_PREV_STEP_ID) {
      if (!allowLoopPrev) {
        return err({
          code: 'invalid_pipeline_graph',
          message: `History read on step "${step.id}" references loop.prev outside a loop group`,
          nodeId: step.id,
        });
      }
      if (read.sourceArtifactRef !== LOOP_PREV_ARTIFACT_REF) {
        return err({
          code: 'missing_artifact',
          message: `History read on step "${step.id}" must use ${LOOP_PREV_ARTIFACT_REF}`,
          nodeId: step.id,
        });
      }
      continue;
    }

    const validation = validateHistoryRead(read, step.id, chainSteps);
    const alwaysInvalid = validation.issues.some((issue) => issue === 'invalid-tag' || issue === 'source-is-self');
    if (!validation.ok && (read.required || alwaysInvalid)) {
      return err({
        code: 'invalid_pipeline_graph',
        message: `Invalid history read on step "${step.id}": ${validation.issues.join(', ')}`,
        nodeId: step.id,
      });
    }

    if (read.required && !validateHistoryReadArtifactRef(read, chainSteps)) {
      return err({
        code: 'missing_artifact',
        message: `History read on step "${step.id}" references unknown artifact: ${read.sourceArtifactRef}`,
        nodeId: step.id,
      });
    }
  }
  return ok(undefined);
}

function validateTemplateArtifactRefs(
  step: PipelineStep,
  chainSteps: PipelineStep[],
  extraArtifactRefs?: readonly string[],
): Result<void, PipelineError> {
  const templateTexts: string[] = [];
  if (step.config.type === 'presentation') templateTexts.push(step.config.text);
  if (step.prompt?.blocks) {
    templateTexts.push(...step.prompt.blocks.filter((block) => block.enabled).map((block) => block.body));
  }

  if (templateTexts.length === 0) return ok(undefined);

  const available = artifactRefsBeforeStep(chainSteps, step.id, extraArtifactRefs);
  for (const text of templateTexts) {
    for (const ref of extractArtifactRefsFromTemplate(text)) {
      if (!available.has(ref)) {
        return err({
          code: 'missing_artifact',
          message: `Step "${step.id}" template references unknown artifact: ${ref}`,
          nodeId: step.id,
        });
      }
    }
  }
  return ok(undefined);
}

function validateCapsuleBindings(
  step: PipelineStep,
  chainSteps: PipelineStep[],
  options: ValidateStepChainOptions = {},
): Result<void, PipelineError> {
  if (step.config.type !== 'capsule-instance') return ok(undefined);
  const config = step.config;
  if (!config.capsuleId.trim()) {
    return err({code: 'missing_capsule', message: 'Capsule instance is missing capsuleId', nodeId: step.id});
  }
  if (!config.capsuleVersion.trim()) {
    return err({code: 'missing_capsule_version', message: 'Capsule instance is missing capsuleVersion', nodeId: step.id});
  }

  const available = artifactRefsBeforeStep(chainSteps, step.id, options.extraArtifactRefs);
  for (const [port, ref] of Object.entries(config.inputBindings)) {
    if (!ref.trim()) {
      return err({
        code: 'invalid_pipeline_graph',
        message: `Capsule input binding "${port}" is empty`,
        nodeId: step.id,
      });
    }
    if (!available.has(ref)) {
      return err({
        code: 'missing_artifact',
        message: `Capsule input "${port}" references unknown artifact: ${ref}`,
        nodeId: step.id,
      });
    }
  }

  for (const [port, ref] of Object.entries(config.outputBindings)) {
    if (!port.trim() || !ref.trim()) {
      return err({
        code: 'invalid_pipeline_graph',
        message: 'Capsule output bindings must have non-empty port names and artifact refs',
        nodeId: step.id,
      });
    }
  }

  const resolved = options.resolveCapsule?.(config.capsuleId, config.capsuleVersion);
  if (resolved) {
    const declaredOutputs = new Set(resolved.interface.outputs.map((output) => output.name));
    for (const port of Object.keys(config.outputBindings)) {
      if (!declaredOutputs.has(port)) {
        return err({
          code: 'invalid_capsule_interface',
          message: `Capsule output binding "${port}" is not declared on ${config.capsuleId} ${config.capsuleVersion}`,
          nodeId: step.id,
        });
      }
    }
    for (const output of resolved.interface.outputs) {
      if (!config.outputBindings[output.name]?.trim()) {
        return err({
          code: 'invalid_capsule_interface',
          message: `Capsule instance is missing output binding for port "${output.name}"`,
          nodeId: step.id,
        });
      }
    }
  }

  return ok(undefined);
}

function validateLoopGroup(
  step: PipelineStep,
  outerStepsBefore: PipelineStep[],
  options: ValidateStepChainOptions = {},
): Result<void, PipelineError> {
  if (step.config.type !== 'loop-group') return ok(undefined);
  const config = step.config;

  if (!Number.isFinite(config.maxIterations) || config.maxIterations < 1) {
    return err({
      code: 'invalid_pipeline_graph',
      message: `Loop group "${step.id}" must have maxIterations >= 1`,
      nodeId: step.id,
    });
  }

  if (config.exitCondition.type === 'json-field-equals' && !config.exitCondition.fieldPath.trim()) {
    return err({
      code: 'invalid_pipeline_graph',
      message: `Loop group "${step.id}" exit condition is missing fieldPath`,
      nodeId: step.id,
    });
  }

  if (config.steps.length === 0) {
    return err({
      code: 'invalid_pipeline_graph',
      message: `Loop group "${step.id}" must contain at least one inner step`,
      nodeId: step.id,
    });
  }

  if (config.steps.some((inner) => inner.config.type === 'loop-group')) {
    return err({
      code: 'invalid_pipeline_graph',
      message: 'Nested loop groups are not supported',
      nodeId: step.id,
    });
  }

  if (step.enabled && !config.steps.some((inner) => inner.enabled)) {
    return err({
      code: 'invalid_pipeline_graph',
      message: `Loop group "${step.id}" must contain at least one enabled inner step`,
      nodeId: step.id,
    });
  }

  const innerIds = validateUniqueStepIds(config.steps);
  if (!innerIds.ok) return innerIds;

  const innerPrimary = validatePrimaryOutputNames(config.steps);
  if (!innerPrimary.ok) return innerPrimary;

  const chainSteps = [...outerStepsBefore, step, ...config.steps];
  return validateStepList(config.steps, chainSteps, true, options);
}

function validateInlineCapsuleSteps(
  step: PipelineStep,
  outerStepsBefore: PipelineStep[],
  options: ValidateStepChainOptions = {},
): Result<void, PipelineError> {
  if (step.config.type !== 'capsule-instance') return ok(undefined);
  const inlineSteps = step.config.inlineSteps;
  if (!inlineSteps?.length) return ok(undefined);

  const nestedIds = validateUniqueStepIds(inlineSteps);
  if (!nestedIds.ok) return nestedIds;

  const nestedPrimary = validatePrimaryOutputNames(inlineSteps);
  if (!nestedPrimary.ok) return nestedPrimary;

  const chainSteps = [...outerStepsBefore, step, ...inlineSteps];
  return validateStepList(inlineSteps, chainSteps, false, options);
}

function validateDuplicateArtifactKeys(steps: PipelineStep[]): Result<void, PipelineError> {
  const seen = new Set<string>();
  for (const step of steps) {
    const keys = step.config.type === 'loop-group'
      ? step.config.steps.flatMap((inner) => stepProducedArtifactKeys(inner))
      : stepProducedArtifactKeys(step);
    for (const key of keys) {
      if (seen.has(key)) {
        return err({
          code: 'duplicate_artifact_key',
          message: `Duplicate artifact key: ${key}`,
          nodeId: step.id,
        });
      }
      seen.add(key);
    }
  }
  return ok(undefined);
}

function validateStepList(
  steps: PipelineStep[],
  chainSteps: PipelineStep[],
  allowLoopPrev = false,
  options: ValidateStepChainOptions = {},
): Result<void, PipelineError> {
  for (const step of steps) {
    const stepIndex = chainSteps.findIndex((candidate) => candidate.id === step.id);
    const outerBefore = stepIndex >= 0 ? chainSteps.slice(0, stepIndex) : chainSteps;

    const historyResult = validateStepHistoryReads(step, chainSteps, allowLoopPrev);
    if (!historyResult.ok) return historyResult;

    const templateResult = validateTemplateArtifactRefs(step, chainSteps, options.extraArtifactRefs);
    if (!templateResult.ok) return templateResult;

    const capsuleResult = validateCapsuleBindings(step, chainSteps, options);
    if (!capsuleResult.ok) return capsuleResult;

    const loopResult = validateLoopGroup(step, outerBefore, options);
    if (!loopResult.ok) return loopResult;

    const inlineResult = validateInlineCapsuleSteps(step, outerBefore, options);
    if (!inlineResult.ok) return inlineResult;
  }

  return ok(undefined);
}

export function validateStepChainBody(
  steps: PipelineStep[],
  options: ValidateStepChainOptions = {},
): Result<void, PipelineError> {
  const ids = validateUniqueStepIds(steps);
  if (!ids.ok) return ids;

  const primary = validatePrimaryOutputNames(steps);
  if (!primary.ok) return primary;

  const dupes = validateDuplicateArtifactKeys(steps);
  if (!dupes.ok) return dupes;

  return validateStepList(steps, steps, false, options);
}

export function validateStepChainPipeline(
  def: PipelineDefinition,
  options: ValidateStepChainOptions = {},
): Result<void, PipelineError> {
  if (def.outputStepId && !def.steps.some((step) => step.id === def.outputStepId)) {
    return err({
      code: 'invalid_pipeline_graph',
      message: `outputStepId references unknown step: ${def.outputStepId}`,
    });
  }
  return validateStepChainBody(def.steps, options);
}
