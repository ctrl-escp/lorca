import type {
  CapsuleDefinition,
  CapsuleInputPort,
  CapsuleInterface,
  CapsuleOutputPort,
  CapsuleModelSlot,
  CapsuleValueKind,
  LegacyPipelineDefinition,
  PipelineDefinition,
  PipelineInputConfig,
  PipelineStep,
  StepHistoryReadConfig,
} from '@lorca/core';
import {PIPELINE_INPUT_STEP_ID} from '@lorca/core';
import {migrateLegacyPipeline} from './chainCompiler.js';
import {buildActiveStepChain, compileActiveStepsToExecutionPlan} from './chainCompiler.js';
import {getStepHistoryReads} from './historyReads.js';
import {stepArtifactKey} from './artifacts.js';
import {newStepId} from './stepId.js';

export type CapsuleExtractionErrorCode =
  | 'empty_selection'
  | 'invalid_range'
  | 'unsupported_step_type'
  | 'nested_capsule'
  | 'nested_loop';

export interface CapsuleExtractionError {
  code: CapsuleExtractionErrorCode;
  message: string;
  stepId?: string;
}

export interface CapsuleExtractionRequest {
  pipeline: PipelineDefinition;
  /** Inclusive index into pipeline.steps */
  startIndex: number;
  /** Inclusive index into pipeline.steps */
  endIndex: number;
  capsuleId: string;
  capsuleName: string;
  instanceStepId?: string;
  instanceLabel?: string;
}

export interface CapsuleExtractionResult {
  capsule: CapsuleDefinition;
  instanceStep: PipelineStep;
  pipeline: PipelineDefinition;
}

const UNSUPPORTED_IN_CAPSULE = new Set(['capsule-instance', 'loop-group']);

function artifactNamespace(ref: string): string {
  const dot = ref.lastIndexOf('.');
  return dot >= 0 ? ref.slice(0, dot) : ref;
}

function artifactOutputName(ref: string): string {
  const dot = ref.lastIndexOf('.');
  return dot >= 0 ? ref.slice(dot + 1) : ref;
}

function inferKind(ref: string): CapsuleValueKind {
  const out = artifactOutputName(ref);
  if (out === 'json') return 'json';
  return 'text';
}

function portNameForExternalRef(ref: string): string {
  if (ref.startsWith('user_prompt.')) return 'user_prompt';
  return artifactNamespace(ref).replace(/-/g, '_');
}

function resolveRefSourceStepId(
  ref: string,
  allSteps: PipelineStep[],
): string | typeof PIPELINE_INPUT_STEP_ID | null {
  const ns = artifactNamespace(ref);
  if (ns === 'user_prompt') return PIPELINE_INPUT_STEP_ID;
  const step = allSteps.find((s) => s.outputNamespace === ns);
  return step?.id ?? null;
}

function isRefFromSelection(
  ref: string,
  selectedIds: Set<string>,
  allSteps: PipelineStep[],
): boolean {
  const sourceId = resolveRefSourceStepId(ref, allSteps);
  if (sourceId === null) return false;
  if (sourceId === PIPELINE_INPUT_STEP_ID) return false;
  return selectedIds.has(sourceId);
}

function collectExternalInputRefs(
  selectedSteps: PipelineStep[],
  selectedIds: Set<string>,
  allSteps: PipelineStep[],
  startIndex: number,
): Set<string> {
  const external = new Set<string>();
  const activeAll = buildActiveStepChain(allSteps);
  const activeSelected = buildActiveStepChain(selectedSteps);

  for (const step of selectedSteps) {
    for (const read of getStepHistoryReads(step)) {
      if (!isRefFromSelection(read.sourceArtifactRef, selectedIds, allSteps)) {
        external.add(read.sourceArtifactRef);
      }
    }
  }

  const plan = compileActiveStepsToExecutionPlan(activeSelected, {allSteps});
  for (const compiled of plan.steps) {
    if (compiled.previousOutputArtifactRef
      && !isRefFromSelection(compiled.previousOutputArtifactRef, selectedIds, allSteps)) {
      external.add(compiled.previousOutputArtifactRef);
    }
  }

  if (startIndex > 0 && activeSelected.length > 0) {
    const firstSelected = activeSelected[0]!;
    const priorActive = activeAll.filter((s) => {
      const idx = allSteps.findIndex((x) => x.id === s.id);
      const firstIdx = allSteps.findIndex((x) => x.id === firstSelected.id);
      return idx >= 0 && idx < firstIdx;
    });
    const prev = priorActive.at(-1);
    if (prev) {
      external.add(stepArtifactKey(prev));
    }
  }

  return external;
}

function collectExternalOutputRefs(
  selectedSteps: PipelineStep[],
  selectedIds: Set<string>,
  allSteps: PipelineStep[],
  endIndex: number,
): Map<string, string> {
  /** port name -> parent artifact ref to preserve */
  const outputs = new Map<string, string>();

  const addOutput = (ref: string) => {
    const name = portNameForExternalRef(ref);
    if (!outputs.has(name)) outputs.set(name, ref);
  };

  for (const step of selectedSteps) {
    addOutput(stepArtifactKey(step));
    if (step.config.type === 'model-call') {
      addOutput(`${step.outputNamespace}.rawResponse`);
    }
  }

  const downstream = allSteps.slice(endIndex + 1);
  for (const step of downstream) {
    for (const read of getStepHistoryReads(step)) {
      if (isRefFromSelection(read.sourceArtifactRef, selectedIds, allSteps)) {
        addOutput(read.sourceArtifactRef);
      }
    }
  }

  const activeAll = buildActiveStepChain(allSteps);
  const activeSelected = buildActiveStepChain(selectedSteps);
  if (activeSelected.length > 0 && downstream.length > 0) {
    const lastSelected = activeSelected.at(-1)!;
    const lastIdx = activeAll.findIndex((s) => s.id === lastSelected.id);
    const firstDown = activeAll.find((s) => downstream.some((d) => d.id === s.id));
    if (firstDown && lastIdx >= 0) {
      const firstDownIdx = activeAll.findIndex((s) => s.id === firstDown.id);
      if (firstDownIdx === lastIdx + 1) {
        addOutput(stepArtifactKey(lastSelected));
      }
    }
  }

  return outputs;
}

function remapHistoryRead(
  read: StepHistoryReadConfig,
  inputPortByParentRef: Map<string, string>,
): StepHistoryReadConfig {
  const port = inputPortByParentRef.get(read.sourceArtifactRef);
  if (!port) return read;
  const portRef = port === 'user_prompt' ? 'user_prompt.xml' : `${port}.${artifactOutputName(read.sourceArtifactRef)}`;
  return {
    ...read,
    sourceStepId: PIPELINE_INPUT_STEP_ID,
    sourceArtifactRef: portRef,
  };
}

function remapStepForCapsule(
  step: PipelineStep,
  inputPortByParentRef: Map<string, string>,
): PipelineStep {
  const clone: PipelineStep = JSON.parse(JSON.stringify(step));

  const remapReads = (reads: StepHistoryReadConfig[]) =>
    reads.map((r) => remapHistoryRead(r, inputPortByParentRef));

  if (clone.prompt?.historyReads) {
    clone.prompt = {...clone.prompt, historyReads: remapReads(clone.prompt.historyReads)};
  }
  if (clone.historyReads) {
    clone.historyReads = remapReads(clone.historyReads);
  }

  if (clone.prompt?.previousOutput.enabled) {
    const prevRef = compileActiveStepsToExecutionPlan([clone], {allSteps: [clone]}).steps[0]
      ?.previousOutputArtifactRef;
    if (prevRef && inputPortByParentRef.has(prevRef)) {
      clone.prompt = {
        ...clone.prompt,
        previousOutput: {...clone.prompt.previousOutput, enabled: false},
      };
    }
  }

  return clone;
}

function collectModelSlots(steps: PipelineStep[]): CapsuleModelSlot[] {
  const slots = new Map<string, CapsuleModelSlot>();
  for (const step of steps) {
    if (step.config.type !== 'model-call') continue;
    const {modelRef} = step.config;
    if (modelRef.kind !== 'slot') continue;
    if (!slots.has(modelRef.slotName)) {
      slots.set(modelRef.slotName, {
        name: modelRef.slotName,
        suggestedBuckets: ['general'],
        required: true,
      });
    }
  }
  return [...slots.values()];
}

function buildCapsuleInterface(
  inputRefs: Set<string>,
  outputRefs: Map<string, string>,
  innerSteps: PipelineStep[],
): CapsuleInterface {
  const inputs: CapsuleInputPort[] = [...inputRefs].map((ref) => ({
    name: portNameForExternalRef(ref),
    kind: inferKind(ref),
    required: true,
    description: `Bound from parent pipeline artifact ${ref}`,
    defaultArtifactKey: ref,
  }));

  const outputs: CapsuleOutputPort[] = [...outputRefs.entries()].map(([name, ref]) => {
    const port: CapsuleOutputPort = {
      name,
      kind: inferKind(ref),
      description: `Exposed to parent as ${ref}`,
    };
    if (ref.includes('.')) port.sourceArtifactKey = ref;
    return port;
  });

  return {inputs, outputs, parameters: [], modelSlots: collectModelSlots(innerSteps)};
}

const DEFAULT_CAPSULE_INPUT: PipelineInputConfig = {
  raw: '',
  tagName: 'user',
  outputNamespace: 'user_prompt',
};

export function stripCapsuleLegacyGraphFields(capsule: CapsuleDefinition): CapsuleDefinition {
  if (capsule.steps === undefined) return capsule;
  const {nodes: _nodes, edges: _edges, outputRef: _outputRef, ...rest} = capsule;
  return rest;
}

export function extractStepsToCapsule(
  request: CapsuleExtractionRequest,
): {ok: true; value: CapsuleExtractionResult} | {ok: false; error: CapsuleExtractionError} {
  const {pipeline, startIndex, endIndex, capsuleId, capsuleName} = request;
  const {steps: allSteps} = pipeline;

  if (startIndex < 0 || endIndex >= allSteps.length || startIndex > endIndex) {
    return {ok: false, error: {code: 'invalid_range', message: 'Step range is out of bounds'}};
  }

  const selectedSteps = allSteps.slice(startIndex, endIndex + 1);
  if (selectedSteps.length === 0) {
    return {ok: false, error: {code: 'empty_selection', message: 'No steps selected for extraction'}};
  }

  const selectedIds = new Set(selectedSteps.map((s) => s.id));
  for (const step of selectedSteps) {
    if (UNSUPPORTED_IN_CAPSULE.has(step.type)) {
      const code = step.type === 'capsule-instance' ? 'nested_capsule' : 'nested_loop';
      return {
        ok: false,
        error: {
          code: code === 'nested_capsule' ? 'nested_capsule' : 'nested_loop',
          message: `Cannot extract ${step.type} steps into a Capsule in V1`,
          stepId: step.id,
        },
      };
    }
  }

  const externalInputs = collectExternalInputRefs(selectedSteps, selectedIds, allSteps, startIndex);
  const externalOutputs = collectExternalOutputRefs(selectedSteps, selectedIds, allSteps, endIndex);

  const inputPortByParentRef = new Map<string, string>();
  for (const ref of externalInputs) {
    inputPortByParentRef.set(ref, portNameForExternalRef(ref));
  }

  const innerSteps = selectedSteps.map((s) => remapStepForCapsule(s, inputPortByParentRef));
  const now = new Date().toISOString();
  const capsuleInterface = buildCapsuleInterface(externalInputs, externalOutputs, innerSteps);

  const lastInner = innerSteps.at(-1)!;
  const primaryPort = portNameForExternalRef(stepArtifactKey(lastInner));
  if (!capsuleInterface.outputs.some((o) => o.name === primaryPort)) {
    capsuleInterface.outputs.push({
      name: primaryPort,
      kind: inferKind(stepArtifactKey(lastInner)),
      sourceArtifactKey: stepArtifactKey(lastInner),
    });
  }

  const capsule: CapsuleDefinition = {
    schemaVersion: 2,
    id: capsuleId,
    name: capsuleName,
    version: 'v1',
    status: 'draft',
    interface: capsuleInterface,
    steps: innerSteps,
    input: {...pipeline.input},
    tests: [],
    createdAt: now,
    updatedAt: now,
  };

  const instanceNs = capsuleName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'capsule';
  const instanceId = request.instanceStepId ?? newStepId('cap_inst');
  const inputBindings: Record<string, string> = {};
  for (const ref of externalInputs) {
    const port = portNameForExternalRef(ref);
    inputBindings[port] = ref;
  }

  const outputBindings: Record<string, string> = {};
  for (const [port, ref] of externalOutputs) {
    outputBindings[port] = ref;
  }
  const primaryOutputName = lastInner.primaryOutputName;
  if (!outputBindings[primaryPort]) {
    outputBindings[primaryPort] = stepArtifactKey(lastInner);
  }

  const contentSignature = computeCapsuleContentSignature(capsule);

  const instanceStep: PipelineStep = {
    id: instanceId,
    type: 'capsule-instance',
    label: request.instanceLabel ?? capsuleName,
    enabled: true,
    outputNamespace: instanceNs,
    primaryOutputName,
    lastEditedAt: now,
    config: {
      type: 'capsule-instance',
      capsuleId,
      capsuleVersion: 'v1',
      inputBindings,
      outputBindings,
      boundContentSignature: contentSignature,
    },
  };

  const newSteps = [
    ...allSteps.slice(0, startIndex),
    instanceStep,
    ...allSteps.slice(endIndex + 1),
  ];

  return {
    ok: true,
    value: {
      capsule,
      instanceStep,
      pipeline: {
        ...pipeline,
        steps: newSteps,
        updatedAt: now,
      },
    },
  };
}

export function extractFullPipelineToCapsule(
  pipeline: PipelineDefinition,
  capsuleId: string,
  capsuleName: string,
): {ok: true; value: CapsuleExtractionResult} | {ok: false; error: CapsuleExtractionError} {
  if (pipeline.steps.length === 0) {
    return {ok: false, error: {code: 'empty_selection', message: 'Pipeline has no steps to extract'}};
  }
  return extractStepsToCapsule({
    pipeline,
    startIndex: 0,
    endIndex: pipeline.steps.length - 1,
    capsuleId,
    capsuleName,
  });
}

/** Ensure capsules use steps[] as canonical body; migrate graph-only capsules on load. */
export function ensureCapsuleStepChain(capsule: CapsuleDefinition): CapsuleDefinition {
  const input = capsule.input ?? DEFAULT_CAPSULE_INPUT;

  if (capsule.steps !== undefined) {
    return stripCapsuleLegacyGraphFields({...capsule, input});
  }

  if (!(capsule.nodes?.length ?? 0)) {
    return {...capsule, input, steps: []};
  }

  const legacy: LegacyPipelineDefinition = {
    schemaVersion: 1,
    id: capsule.id,
    name: capsule.name,
    inputArtifactName: 'user_prompt',
    nodes: capsule.nodes ?? [],
    edges: capsule.edges ?? [],
    outputRef: capsule.outputRef ?? {nodeId: '', outputName: 'text'},
    createdAt: capsule.createdAt,
    updatedAt: capsule.updatedAt,
  };
  if (capsule.description !== undefined) legacy.description = capsule.description;

  const migrated = migrateLegacyPipeline(legacy);
  return stripCapsuleLegacyGraphFields({
    ...capsule,
    input: migrated.input,
    steps: migrated.steps,
  });
}

/** Stable hash of capsule body for instance staleness when definition changes. */
export function computeCapsuleContentSignature(capsule: CapsuleDefinition): string {
  const canonical = ensureCapsuleStepChain(capsule);
  const json = JSON.stringify({
    interface: canonical.interface,
    steps: canonical.steps ?? [],
    input: canonical.input,
  });
  let h = 5381;
  for (let i = 0; i < json.length; i++) h = ((h << 5) + h) ^ json.charCodeAt(i);
  return (h >>> 0).toString(36);
}
