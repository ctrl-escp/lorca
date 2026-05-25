import type {CapsuleDefinition, ModelRef, PipelineInputConfig, PipelineStep, StepConfig, StepType} from '@lorca/core';

let _counter = 0;
export function newStepId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${(++_counter).toString(36)}`;
}

export type StepIdFactory = (prefix: string) => string;

export function defaultStepConfig(type: StepType): StepConfig {
  switch (type) {
    case 'model-call':
      return {
        type: 'model-call',
        modelRef: {kind: 'fixed', endpointId: '', modelName: ''},
        mode: 'generate',
        outputNames: ['text', 'rawResponse'],
      };
    case 'presentation':
      return {type: 'presentation', text: '', outputNames: ['text']};
    case 'capsule-instance':
      return {
        type: 'capsule-instance',
        capsuleId: '',
        capsuleVersion: 'v1',
        inputBindings: {},
        outputBindings: {},
      };
    case 'loop-group':
      return {
        type: 'loop-group',
        maxIterations: 3,
        exitCondition: {type: 'json-field-equals', fieldPath: 'passed', value: true},
        steps: [],
        outputNames: ['text'],
      };
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown step type: ${_exhaustive}`);
    }
  }
}

export function defaultPrimaryOutputName(_type: StepType): string {
  return 'text';
}

export function defaultStepLabel(type: StepType): string {
  const labels: Record<StepType, string> = {
    'model-call': 'Model Call',
    'presentation': 'Text',
    'capsule-instance': 'Capsule',
    'loop-group': 'Loop',
  };
  return labels[type];
}

export function defaultOutputNamespace(type: StepType, existingNamespaces: ReadonlySet<string>): string {
  return uniqueNamespace(type.replace(/-/g, '_'), existingNamespaces);
}

export function uniqueNamespace(base: string, existingNamespaces: ReadonlySet<string>): string {
  let ns = base;
  let i = 2;
  while (existingNamespaces.has(ns)) {
    ns = `${base}_${i++}`;
  }
  return ns;
}

export function defaultTemplateText(steps: readonly PipelineStep[], input: PipelineInputConfig): string {
  const lastModelCall = [...steps].reverse().find((s) => s.config.type === 'model-call');
  const inputRef = `{{artifact.${input.outputNamespace}.raw}}`;
  if (!lastModelCall) return inputRef;
  const responseRef = `{{artifact.${lastModelCall.outputNamespace}.text}}`;
  return `${inputRef}\n\n${responseRef}`;
}

export function defaultModelSlotBindings(capsule: CapsuleDefinition): Record<string, ModelRef> {
  const bindings: Record<string, ModelRef> = {};
  for (const slot of capsule.interface.modelSlots) {
    if (slot.defaultModelRef) {
      bindings[slot.name] = {
        kind: 'fixed',
        endpointId: slot.defaultModelRef.endpointId,
        modelName: slot.defaultModelRef.modelName,
      };
      continue;
    }
    const modelName = slot.preferredModelNames?.[0];
    if (modelName) bindings[slot.name] = {kind: 'any-enabled-endpoint', modelName};
  }
  return bindings;
}

export function buildDefaultStep(
  type: StepType,
  existingNamespaces: ReadonlySet<string>,
  overrides?: Partial<PipelineStep>,
  createId: StepIdFactory = newStepId,
): PipelineStep {
  const ns = defaultOutputNamespace(type, existingNamespaces);
  return {
    id: createId(type.replace(/-/g, '_')),
    type,
    label: defaultStepLabel(type),
    enabled: true,
    outputNamespace: ns,
    primaryOutputName: defaultPrimaryOutputName(type),
    lastEditedAt: new Date().toISOString(),
    config: defaultStepConfig(type),
    ...overrides,
  };
}
