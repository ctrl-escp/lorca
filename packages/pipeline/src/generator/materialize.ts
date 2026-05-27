import type {LoopExitCondition, ModelRef, PipelineStep, PromptBlock, StepHistoryReadConfig} from '@lorca/core';
import {parseGeneratorArtifactRef} from './refs.js';
import {computeCapsuleContentSignature} from '../capsuleExtraction.js';
import {newStepId} from '../stepId.js';
import {MaterializeState} from './materializeState.js';
import {convertGeneratorTemplateText} from './refResolve.js';
import type {
  GeneratorCapsuleEntry,
  GeneratorCustomEntry,
  GeneratorInputSource,
  GeneratorLoopEntry,
  GeneratorPlanEntry,
  GeneratorPresentationEntry,
  GeneratorSuggestionEntry,
} from './types.js';

function clampIterations(value: number | undefined): number {
  if (!Number.isFinite(value)) return 3;
  return Math.max(1, Math.min(10, Math.floor(value!)));
}

function defaultInputSource(context: MaterializeState['context']): GeneratorInputSource {
  return context.applyMode === 'append' ? 'current-pipeline-last' : 'user';
}

function applyFirstModelCallInputSource(
  step: PipelineStep,
  inputSource: GeneratorInputSource | undefined,
  state: MaterializeState,
): void {
  if (step.type !== 'model-call') return;
  if (!state.consumeFirstModelCallSlot()) return;

  const source = inputSource ?? defaultInputSource(state.context);
  const prompt = step.prompt ?? {
    previousOutput: {enabled: false, placement: 'afterOwnPrompt', tagName: 'previous_output'},
    historyReads: [],
    blocks: [],
  };

  if (source === 'user') {
    prompt.previousOutput = {enabled: false, placement: 'afterOwnPrompt', tagName: 'previous_output'};
  } else {
    prompt.previousOutput = {enabled: true, placement: 'afterOwnPrompt', tagName: 'previous_output'};
  }

  step.prompt = prompt;
}

function applyPromptBody(step: PipelineStep, body: string): void {
  if (step.type !== 'model-call') return;
  const block: PromptBlock = {
    id: newStepId('block'),
    label: 'Instructions',
    tagName: 'system',
    body,
    enabled: true,
    source: 'custom',
  };
  step.prompt = {
    previousOutput: step.prompt?.previousOutput ?? {
      enabled: false,
      placement: 'afterOwnPrompt',
      tagName: 'previous_output',
    },
    historyReads: step.prompt?.historyReads ?? [],
    blocks: [block],
  };
}

function applyHistoryReads(
  step: PipelineStep,
  reads: GeneratorCustomEntry['historyReads'],
  stepKey: string,
  state: MaterializeState,
  errors: string[],
): void {
  if (step.type !== 'model-call' || !reads?.length) return;
  const historyReads: StepHistoryReadConfig[] = [];
  for (const read of reads) {
    const artifactKey = state.resolveArtifactKey(read.ref, stepKey);
    if (!artifactKey) {
      errors.push(`Could not resolve history ref ${read.ref} on step "${stepKey}"`);
      continue;
    }
    const parsed = parseGeneratorArtifactRef(read.ref);
    const sourceStepId = parsed?.scope === 'generated'
      ? (state.stepKeyMap.get(parsed.stepKey)?.stepId ?? '')
      : '';
    historyReads.push({
      sourceStepId,
      sourceArtifactRef: artifactKey,
      tagName: read.tagName,
      required: false,
    });
  }
  if (!step.prompt) return;
  step.prompt.historyReads = historyReads;
}

function pickPrimaryStep(steps: PipelineStep[]): PipelineStep {
  const modelCalls = steps.filter((s) => s.type === 'model-call');
  return modelCalls.at(-1) ?? steps.at(-1)!;
}

function assignStepKeyNamespace(step: PipelineStep, stepKey: string, state: MaterializeState): void {
  const ns = state.namespaceForStepKey(stepKey);
  step.outputNamespace = ns;
}

function materializeSuggestion(
  entry: GeneratorSuggestionEntry,
  state: MaterializeState,
  errors: string[],
): void {
  const instantiated = state.context.instantiateSuggestion(
    entry.suggestionId,
    state.namespaces,
    state.steps,
  );
  if (!instantiated?.length) {
    errors.push(`Failed to instantiate suggestion "${entry.suggestionId}"`);
    return;
  }

  const primary = pickPrimaryStep(instantiated);
  assignStepKeyNamespace(primary, entry.stepKey, state);

  if (entry.label) {
    for (const step of instantiated) {
      if (step.id === primary.id) step.label = entry.label;
    }
  }

  const prompt = entry.prompt;
  if (prompt?.mode === 'catalog' && prompt.rolePromptId) {
    const text = state.context.getRolePrompt(prompt.rolePromptId);
    if (text) applyPromptBody(primary, text);
  } else if (prompt?.mode === 'custom' && prompt.text) {
    applyPromptBody(primary, prompt.text);
  }

  applyFirstModelCallInputSource(primary, undefined, state);

  for (const step of instantiated) state.steps.push(step);
  state.registerStepKey(entry.stepKey, primary);

  if (primary.type === 'model-call') {
    state.modelRequests.push({stepId: primary.id, stepKey: entry.stepKey});
  }
}

function materializeCustom(
  entry: GeneratorCustomEntry,
  state: MaterializeState,
  errors: string[],
): void {
  const ns = state.namespaceForStepKey(entry.stepKey);
  const id = newStepId('model_call');
  let body = '';
  const prompt = entry.prompt;
  if (prompt?.mode === 'custom' && prompt.text) {
    body = prompt.text;
  } else if (prompt?.mode === 'catalog' && prompt.rolePromptId) {
    body = state.context.getRolePrompt(prompt.rolePromptId) ?? '';
    if (!body) errors.push(`Unknown rolePromptId: ${prompt.rolePromptId}`);
  }

  const step: PipelineStep = {
    id,
    type: 'model-call',
    label: entry.label ?? entry.stepKey,
    enabled: true,
    outputNamespace: ns,
    primaryOutputName: 'text',
    lastEditedAt: new Date().toISOString(),
    config: {
      type: 'model-call',
      modelRef: {kind: 'fixed', endpointId: '', modelName: ''},
      mode: 'generate',
      outputNames: ['text', 'rawResponse'],
      ...(entry.outputType === 'json' ? {outputType: 'json'} : {}),
    },
    prompt: {
      previousOutput: {enabled: false, placement: 'afterOwnPrompt', tagName: 'previous_output'},
      historyReads: [],
      blocks: body
        ? [{
          id: newStepId('block'),
          label: 'Instructions',
          tagName: 'system',
          body,
          enabled: true,
          source: 'custom',
        }]
        : [],
    },
  };

  applyHistoryReads(step, entry.historyReads, entry.stepKey, state, errors);
  applyFirstModelCallInputSource(step, entry.inputSource, state);

  state.steps.push(step);
  state.registerStepKey(entry.stepKey, step);
  state.modelRequests.push({
    stepId: id,
    stepKey: entry.stepKey,
    ...(entry.modelId ? {modelId: entry.modelId} : {}),
    ...(entry.modelBucket ? {modelBucket: entry.modelBucket} : {}),
  });
}

function materializeCapsule(
  entry: GeneratorCapsuleEntry,
  state: MaterializeState,
  errors: string[],
): void {
  const capsule = state.context.resolveCapsule(entry.capsuleId, entry.capsuleVersion);
  if (!capsule) {
    errors.push(`Unknown capsule ${entry.capsuleId}@${entry.capsuleVersion}`);
    return;
  }

  const ns = state.namespaceForStepKey(entry.stepKey);
  const id = newStepId('cap_inst');
  const inputBindings: Record<string, string> = {};
  for (const [port, ref] of Object.entries(entry.inputBindings ?? {})) {
    const artifactKey = state.resolveArtifactKey(ref, entry.stepKey);
    if (!artifactKey) {
      errors.push(`Could not resolve input binding ${port}=${ref} on "${entry.stepKey}"`);
      continue;
    }
    inputBindings[port] = artifactKey;
  }

  const outputBindings: Record<string, string> = {};
  const explicitOutputs = entry.outputBindings ?? {};
  if (Object.keys(explicitOutputs).length > 0) {
    for (const [port, ref] of Object.entries(explicitOutputs)) {
      const artifactKey = state.resolveArtifactKey(ref, entry.stepKey);
      if (!artifactKey) {
        errors.push(`Could not resolve output binding ${port}=${ref} on "${entry.stepKey}"`);
        continue;
      }
      outputBindings[port] = artifactKey;
    }
  } else {
    for (const port of capsule.interface.outputs) {
      const suffix = port.sourceArtifactKey?.split('.').pop() ?? port.name;
      outputBindings[port.name] = `${ns}.${suffix}`;
    }
  }

  const lastOut = capsule.interface.outputs.at(-1);
  const primaryOutputName = lastOut
    ? (lastOut.sourceArtifactKey?.split('.').pop() ?? 'text')
    : 'text';

  const modelSlotBindings: Record<string, ModelRef> = {};
  for (const slot of capsule.interface.modelSlots) {
    modelSlotBindings[slot.name] = {kind: 'fixed', endpointId: '', modelName: ''};
  }

  const step: PipelineStep = {
    id,
    type: 'capsule-instance',
    label: entry.label ?? capsule.name,
    enabled: true,
    outputNamespace: ns,
    primaryOutputName,
    lastEditedAt: new Date().toISOString(),
    config: {
      type: 'capsule-instance',
      capsuleId: capsule.id,
      capsuleVersion: capsule.version,
      inputBindings,
      outputBindings,
      displayMode: 'opaque',
      boundContentSignature: computeCapsuleContentSignature(capsule),
      ...(Object.keys(modelSlotBindings).length > 0 ? {modelSlotBindings} : {}),
    },
  };

  state.steps.push(step);
  state.registerStepKey(entry.stepKey, step);
  if (capsule.interface.modelSlots.length > 0) {
    state.modelRequests.push({
      stepId: id,
      stepKey: entry.stepKey,
      ...(entry.slotModels && Object.keys(entry.slotModels).length > 0
        ? {slotModels: entry.slotModels}
        : {}),
    });
  }
}

function materializePresentation(
  entry: GeneratorPresentationEntry,
  state: MaterializeState,
  errors: string[],
): void {
  const converted = convertGeneratorTemplateText(
    entry.text,
    state.stepKeyMap,
    state.context.existingPipeline,
    entry.stepKey,
  );
  if (converted.error) {
    errors.push(converted.error);
    return;
  }

  const ns = state.namespaceForStepKey(entry.stepKey);
  const step: PipelineStep = {
    id: newStepId('presentation'),
    type: 'presentation',
    label: entry.label ?? entry.stepKey,
    enabled: true,
    outputNamespace: ns,
    primaryOutputName: 'text',
    lastEditedAt: new Date().toISOString(),
    config: {type: 'presentation', text: converted.text, outputNames: ['text']},
  };

  state.steps.push(step);
  state.registerStepKey(entry.stepKey, step);
}

function materializeLoop(
  entry: GeneratorLoopEntry,
  state: MaterializeState,
  errors: string[],
): void {
  const innerState = state.childForLoopBody();
  materializeEntries(entry.steps, innerState, errors);
  state.absorbNamespacesFrom(innerState.steps);

  const loopNs = state.namespaceForStepKey(entry.stepKey);
  const loopStep: PipelineStep = {
    id: newStepId('loop_group'),
    type: 'loop-group',
    label: entry.label ?? entry.stepKey,
    enabled: true,
    outputNamespace: loopNs,
    primaryOutputName: 'text',
    lastEditedAt: new Date().toISOString(),
    config: {
      type: 'loop-group',
      maxIterations: clampIterations(entry.maxIterations),
      exitCondition: (entry.exitCondition ?? {type: 'iterations'}) as LoopExitCondition,
      steps: innerState.steps,
      outputNames: ['text'],
    },
  };

  state.steps.push(loopStep);
  state.registerStepKey(entry.stepKey, loopStep);
}

export function materializeEntries(
  entries: readonly GeneratorPlanEntry[],
  state: MaterializeState,
  errors: string[],
): void {
  for (const entry of entries) {
    switch (entry.kind) {
      case 'suggestion':
        materializeSuggestion(entry, state, errors);
        break;
      case 'custom':
        materializeCustom(entry, state, errors);
        break;
      case 'capsule':
        materializeCapsule(entry, state, errors);
        break;
      case 'presentation':
        materializePresentation(entry, state, errors);
        break;
      case 'loop':
        materializeLoop(entry, state, errors);
        break;
      default: {
        const _exhaustive: never = entry;
        void _exhaustive;
      }
    }
  }
}

export function materializePlan(
  entries: readonly GeneratorPlanEntry[],
  state: MaterializeState,
): string[] {
  const errors: string[] = [];
  materializeEntries(entries, state, errors);
  return errors;
}
