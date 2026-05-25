import type {
  CapsuleDefinition,
  ModelUsageBucket,
  PipelineDefinition,
  PipelineStep,
  PipelineExportFile,
  CapsuleExportFile,
  ModelRef,
  StepOutputsExport,
} from '@lorca/core';
import {resolveModelCallSuggestedBuckets} from '@lorca/capsules';
import {validatePipeline} from '@lorca/pipeline';
import {validateCapsule} from '@lorca/capsules';
import {
  isCapsuleImportSchemaVersion,
  normalizePersistedCapsule,
} from './persistence.js';

const PIPELINE_SCHEMA_VERSION = 2;

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Migrate graph-only capsules and drop legacy graph fields for persistence/export/import. */
function normalizeCapsuleBody(capsule: CapsuleDefinition): CapsuleDefinition {
  return normalizePersistedCapsule(capsule);
}

function cloneCapsuleForExport(capsule: CapsuleDefinition): CapsuleDefinition {
  return deepClone(normalizeCapsuleBody(capsule));
}

export interface ImportContext {
  knownEndpointIds: ReadonlySet<string>;
  knownModelKeys: ReadonlySet<string>;
  knownModelNames: ReadonlySet<string>;
  knownCapsuleKeys: ReadonlySet<string>;
}

export interface MissingModelReference {
  key: string;
  nodeId: string;
  endpointId: string;
  modelName: string;
  label: string;
  /** Models matching any of these usage buckets are shown first in the import remap UI. */
  suggestedBuckets: ModelUsageBucket[];
}

export interface MissingCapsuleReference {
  nodeId: string;
  capsuleDefinitionId: string;
  capsuleVersion: string;
}

export type ModelRemap = {endpointId: string; modelName: string};

export type ImportParseError = {ok: false; errors: string[]};

export type PipelineImportPreview = {
  ok: true;
  kind: 'pipeline';
  pipeline: PipelineDefinition;
  includedCapsules: CapsuleDefinition[];
  missingModels: MissingModelReference[];
  missingCapsules: MissingCapsuleReference[];
};

export type CapsuleImportPreview = {
  ok: true;
  kind: 'capsule';
  capsule: CapsuleDefinition;
  missingModels: MissingModelReference[];
};

export function modelLookupKey(endpointId: string, modelName: string): string {
  return `${endpointId}::${modelName}`;
}

export function capsuleLookupKey(id: string, version: string): string {
  return `${id}::${version}`;
}

export function exportPipeline(
  pipeline: PipelineDefinition,
  includedCapsules: CapsuleDefinition[] = [],
  stepOutputs?: StepOutputsExport | null,
): PipelineExportFile {
  const referenced = collectPipelineCapsuleRefs(pipeline);
  const capsules = includedCapsules.filter((c) =>
    referenced.some((r) => r.capsuleDefinitionId === c.id && r.capsuleVersion === c.version),
  );
  return {
    exportedAt: new Date().toISOString(),
    app: 'lorca',
    kind: 'pipeline',
    pipeline: deepClone(pipeline),
    ...(capsules.length > 0 ? {includedCapsules: capsules.map((c) => cloneCapsuleForExport(c))} : {}),
    ...(stepOutputs ? {stepOutputs: deepClone(stepOutputs)} : {}),
  };
}

export function exportCapsule(
  capsule: CapsuleDefinition,
  stepOutputs?: StepOutputsExport | null,
): CapsuleExportFile {
  return {
    exportedAt: new Date().toISOString(),
    app: 'lorca',
    kind: 'capsule',
    capsule: cloneCapsuleForExport(capsule),
    ...(stepOutputs ? {stepOutputs: deepClone(stepOutputs)} : {}),
  };
}

export function parsePipelineExport(data: unknown): PipelineExportFile | ImportParseError {
  const errors = envelopeErrors(data, 'pipeline');
  if (errors.length > 0) return {ok: false, errors};

  const file = data as PipelineExportFile;
  const schemaErr = schemaVersionError(file.pipeline.schemaVersion, 'pipeline', PIPELINE_SCHEMA_VERSION);
  if (schemaErr) return {ok: false, errors: [schemaErr]};

  if (file.includedCapsules) {
    for (const cap of file.includedCapsules) {
      const capErr = capsuleImportSchemaVersionError(cap.schemaVersion);
      if (capErr) return {ok: false, errors: [capErr]};
    }
  }

  const result = validatePipeline(file.pipeline);
  if (!result.ok) return {ok: false, errors: [result.error.message]};

  for (const cap of file.includedCapsules ?? []) {
    const capVal = validateCapsule(cap);
    if (!capVal.ok) return {ok: false, errors: [capVal.error.message]};
  }

  return file;
}

export function parseCapsuleExport(data: unknown): CapsuleExportFile | ImportParseError {
  const errors = envelopeErrors(data, 'capsule');
  if (errors.length > 0) return {ok: false, errors};

  const file = data as CapsuleExportFile;
  const schemaErr = capsuleImportSchemaVersionError(file.capsule.schemaVersion);
  if (schemaErr) return {ok: false, errors: [schemaErr]};

  const capsule = normalizeCapsuleBody(file.capsule);
  const validation = validateCapsule(capsule);
  if (!validation.ok) return {ok: false, errors: [validation.error.message]};

  return {...file, capsule};
}

export function previewPipelineImport(
  file: PipelineExportFile,
  ctx: ImportContext,
): PipelineImportPreview | ImportParseError {
  const includedCapsules = (file.includedCapsules ?? []).map((cap) => deepClone(normalizeCapsuleBody(cap)));
  const missingModels = findMissingModels(
    collectModelRefsFromSteps(file.pipeline.steps, includedCapsules),
    ctx,
  );
  const missingCapsules = findMissingCapsulesFromSteps(file.pipeline.steps, includedCapsules, ctx);
  return {
    ok: true,
    kind: 'pipeline',
    pipeline: deepClone(file.pipeline),
    includedCapsules: deepClone(includedCapsules),
    missingModels,
    missingCapsules,
  };
}

export function previewCapsuleImport(
  file: CapsuleExportFile,
  ctx: ImportContext,
): CapsuleImportPreview | ImportParseError {
  const capsule = deepClone(normalizeCapsuleBody(file.capsule));
  const modelRefs = collectModelRefsFromSteps(capsule.steps ?? [], [capsule]);
  return {
    ok: true,
    kind: 'capsule',
    capsule,
    missingModels: findMissingModels(modelRefs, ctx),
  };
}

// Used for V2 pipeline steps
export function applyModelRemapsToSteps(
  steps: PipelineStep[],
  remaps: Record<string, ModelRemap>,
): PipelineStep[] {
  return steps.map((step) => {
    if (step.config.type === 'model-call' && step.config.modelRef.kind !== 'slot') {
      const remap = remaps[step.id];
      if (remap) {
        return {
          ...step,
          config: {
            ...step.config,
            modelRef: {kind: 'fixed' as const, endpointId: remap.endpointId, modelName: remap.modelName},
          },
        };
      }
    }
    if (step.config.type === 'capsule-instance' && step.config.modelSlotBindings) {
      const bindings: Record<string, ModelRef> = {...step.config.modelSlotBindings};
      let changed = false;
      for (const slotName of Object.keys(bindings)) {
        const remap = remaps[`${step.id}::${slotName}`];
        if (remap) {
          bindings[slotName] = {kind: 'fixed', endpointId: remap.endpointId, modelName: remap.modelName};
          changed = true;
        }
      }
      if (changed) {
        return {...step, config: {...step.config, modelSlotBindings: bindings}};
      }
    }
    if (step.config.type === 'loop-group') {
      return {
        ...step,
        config: {
          ...step.config,
          steps: applyModelRemapsToSteps(step.config.steps, remaps),
        },
      };
    }
    if (step.config.type === 'capsule-instance' && step.config.inlineSteps) {
      return {
        ...step,
        config: {
          ...step.config,
          inlineSteps: applyModelRemapsToSteps(step.config.inlineSteps, remaps),
        },
      };
    }
    return step;
  });
}

export function prepareImportedPipeline(
  pipeline: PipelineDefinition,
  newId: string,
  remaps: Record<string, ModelRemap>,
): PipelineDefinition {
  const now = new Date().toISOString();
  return {
    ...pipeline,
    id: newId,
    steps: applyModelRemapsToSteps(pipeline.steps, remaps),
    updatedAt: now,
    createdAt: now,
  };
}

export function prepareImportedCapsule(
  capsule: CapsuleDefinition,
  newId: string,
  remaps: Record<string, ModelRemap>,
): CapsuleDefinition {
  const now = new Date().toISOString();
  const migrated = normalizeCapsuleBody(capsule);
  const withRemaps: CapsuleDefinition = {
    ...migrated,
    steps: applyModelRemapsToSteps(migrated.steps ?? [], remaps),
  };
  return {...withRemaps, id: newId, updatedAt: now, createdAt: now};
}

export function collectPipelineCapsuleRefs(
  pipeline: PipelineDefinition,
): Array<{nodeId: string; capsuleDefinitionId: string; capsuleVersion: string}> {
  const result: Array<{nodeId: string; capsuleDefinitionId: string; capsuleVersion: string}> = [];
  for (const step of pipeline.steps) {
    if (step.config.type === 'capsule-instance') {
      const {capsuleId, capsuleVersion} = step.config;
      if (capsuleId && capsuleVersion) {
        result.push({nodeId: step.id, capsuleDefinitionId: capsuleId, capsuleVersion});
      }
    }
  }
  return result;
}

function capsuleSlotBuckets(
  includedCapsules: readonly CapsuleDefinition[],
  capsuleId: string,
  capsuleVersion: string,
  slotName: string,
): ModelUsageBucket[] {
  const cap = includedCapsules.find((c) => c.id === capsuleId && c.version === capsuleVersion);
  const slot = cap?.interface.modelSlots.find((s) => s.name === slotName);
  return slot?.suggestedBuckets?.length ? [...slot.suggestedBuckets] : ['general'];
}

function collectModelRefsFromSteps(
  steps: PipelineStep[],
  includedCapsules: readonly CapsuleDefinition[] = [],
): MissingModelReference[] {
  const refs: MissingModelReference[] = [];
  const visit = (step: PipelineStep) => {
    if (step.config.type === 'model-call' && step.config.modelRef.kind !== 'slot') {
      const {modelName} = step.config.modelRef;
      const endpointId = step.config.modelRef.kind === 'fixed' ? step.config.modelRef.endpointId : '';
      if (!endpointId && !modelName) return;
      refs.push({
        key: step.id,
        nodeId: step.id,
        endpointId,
        modelName,
        label: `Model call ${step.label || step.id}`,
        suggestedBuckets: resolveModelCallSuggestedBuckets(step),
      });
    }
    if (step.config.type === 'capsule-instance' && step.config.modelSlotBindings) {
      const {capsuleId, capsuleVersion} = step.config;
      for (const [slotName, ref] of Object.entries(step.config.modelSlotBindings)) {
        if (ref.kind === 'slot') continue;
        const endpointId = ref.kind === 'fixed' ? ref.endpointId : '';
        if (!endpointId && !ref.modelName) continue;
        refs.push({
          key: `${step.id}::${slotName}`,
          nodeId: step.id,
          endpointId,
          modelName: ref.modelName,
          label: `Capsule slot ${slotName} (${step.label || step.id})`,
          suggestedBuckets: capsuleId && capsuleVersion
            ? capsuleSlotBuckets(includedCapsules, capsuleId, capsuleVersion, slotName)
            : ['general'],
        });
      }
    }
    if (step.config.type === 'loop-group') {
      for (const inner of step.config.steps) visit(inner);
    }
    if (step.config.type === 'capsule-instance') {
      for (const inner of step.config.inlineSteps ?? []) visit(inner);
    }
  };
  for (const step of steps) visit(step);
  return refs;
}

function findMissingModels(
  refs: MissingModelReference[],
  ctx: ImportContext,
): MissingModelReference[] {
  return refs.filter((ref) => {
    if (!ref.modelName) return false;
    if (!ref.endpointId) return !ctx.knownModelNames.has(ref.modelName);
    if (!ctx.knownEndpointIds.has(ref.endpointId)) return true;
    return !ctx.knownModelKeys.has(modelLookupKey(ref.endpointId, ref.modelName));
  });
}

function findMissingCapsulesFromSteps(
  steps: PipelineStep[],
  includedCapsules: CapsuleDefinition[],
  ctx: ImportContext,
): MissingCapsuleReference[] {
  const includedKeys = new Set(
    includedCapsules.map((c) => capsuleLookupKey(c.id, c.version)),
  );
  const missing: MissingCapsuleReference[] = [];
  for (const step of steps) {
    if (step.config.type !== 'capsule-instance') continue;
    const {capsuleId, capsuleVersion} = step.config;
    if (!capsuleId || !capsuleVersion) continue;
    const key = capsuleLookupKey(capsuleId, capsuleVersion);
    if (includedKeys.has(key) || ctx.knownCapsuleKeys.has(key)) continue;
    missing.push({nodeId: step.id, capsuleDefinitionId: capsuleId, capsuleVersion});
  }
  return missing;
}

function envelopeErrors(data: unknown, expectedKind: 'pipeline' | 'capsule'): string[] {
  if (data === null || typeof data !== 'object') return ['Import file must be a JSON object'];
  const obj = data as Record<string, unknown>;
  const errors: string[] = [];
  if (obj.app !== 'lorca') errors.push('Import file is not a Lorca export (app must be "lorca")');
  if (obj.kind !== expectedKind) {
    errors.push(`Expected a ${expectedKind} export file, got kind "${String(obj.kind)}"`);
  }
  const payloadKey = expectedKind === 'pipeline' ? 'pipeline' : 'capsule';
  if (obj[payloadKey] === null || typeof obj[payloadKey] !== 'object') {
    errors.push(`Import file is missing a valid "${payloadKey}" object`);
  }
  return errors;
}

function capsuleImportSchemaVersionError(version: unknown): string | null {
  if (!isCapsuleImportSchemaVersion(version)) {
    return `Unsupported capsule schemaVersion: ${String(version)} (expected 1 or 2)`;
  }
  return null;
}

function schemaVersionError(version: unknown, label: string, expected: number): string | null {
  if (version !== expected) {
    return `Unsupported ${label} schemaVersion: ${String(version)} (expected ${expected})`;
  }
  return null;
}
