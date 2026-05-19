import type {
  CapsuleDefinition,
  PipelineDefinition,
  PipelineExportFile,
  CapsuleExportFile,
  PipelineNode,
} from '@lorca/core';
import {validatePipeline} from '@lorca/pipeline';
import {validateCapsule} from '@lorca/capsules';

const CURRENT_SCHEMA_VERSION = 1;

export interface ImportContext {
  knownEndpointIds: ReadonlySet<string>;
  knownModelKeys: ReadonlySet<string>;
  knownCapsuleKeys: ReadonlySet<string>;
}

export interface MissingModelReference {
  key: string;
  nodeId: string;
  endpointId: string;
  modelName: string;
  label: string;
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
): PipelineExportFile {
  const referenced = collectPipelineCapsuleRefs(pipeline);
  const capsules = includedCapsules.filter((c) =>
    referenced.some((r) => r.capsuleDefinitionId === c.id && r.capsuleVersion === c.version),
  );
  return {
    exportedAt: new Date().toISOString(),
    app: 'lorca',
    kind: 'pipeline',
    pipeline: structuredClone(pipeline),
    ...(capsules.length > 0 ? {includedCapsules: capsules.map((c) => structuredClone(c))} : {}),
  };
}

export function exportCapsule(capsule: CapsuleDefinition): CapsuleExportFile {
  return {
    exportedAt: new Date().toISOString(),
    app: 'lorca',
    kind: 'capsule',
    capsule: structuredClone(capsule),
  };
}

export function parsePipelineExport(data: unknown): PipelineExportFile | ImportParseError {
  const errors = envelopeErrors(data, 'pipeline');
  if (errors.length > 0) return {ok: false, errors};

  const file = data as PipelineExportFile;
  const schemaErr = schemaVersionError(file.pipeline.schemaVersion, 'pipeline');
  if (schemaErr) return {ok: false, errors: [schemaErr]};

  if (file.includedCapsules) {
    for (const cap of file.includedCapsules) {
      const capErr = schemaVersionError(cap.schemaVersion, 'capsule');
      if (capErr) return {ok: false, errors: [capErr]};
    }
  }

  const graph = validatePipeline(file.pipeline);
  if (!graph.ok) return {ok: false, errors: [graph.error.message]};

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
  const schemaErr = schemaVersionError(file.capsule.schemaVersion, 'capsule');
  if (schemaErr) return {ok: false, errors: [schemaErr]};

  const graph = validateCapsule(file.capsule);
  if (!graph.ok) return {ok: false, errors: [graph.error.message]};

  return file;
}

export function previewPipelineImport(
  file: PipelineExportFile,
  ctx: ImportContext,
): PipelineImportPreview | ImportParseError {
  const includedCapsules = file.includedCapsules ?? [];
  const missingModels = findMissingModels(collectModelRefs(file.pipeline.nodes), ctx);
  const missingCapsules = findMissingCapsules(file.pipeline.nodes, includedCapsules, ctx);
  return {
    ok: true,
    kind: 'pipeline',
    pipeline: structuredClone(file.pipeline),
    includedCapsules: includedCapsules.map((c) => structuredClone(c)),
    missingModels,
    missingCapsules,
  };
}

export function previewCapsuleImport(
  file: CapsuleExportFile,
  ctx: ImportContext,
): CapsuleImportPreview | ImportParseError {
  return {
    ok: true,
    kind: 'capsule',
    capsule: structuredClone(file.capsule),
    missingModels: findMissingModels(collectModelRefs(file.capsule.nodes), ctx),
  };
}

export function applyModelRemapsToNodes(
  nodes: PipelineNode[],
  remaps: Record<string, ModelRemap>,
): PipelineNode[] {
  return nodes.map((node) => {
    if (node.type === 'model-call' && node.config.modelRef.kind === 'fixed') {
      const remap = remaps[node.id];
      if (remap) {
        return {
          ...node,
          config: {
            ...node.config,
            modelRef: {kind: 'fixed', endpointId: remap.endpointId, modelName: remap.modelName},
          },
        };
      }
    }
    if (node.type === 'capsule-instance') {
      const assignments = {...node.config.modelSlotAssignments};
      let changed = false;
      for (const [slotName] of Object.entries(assignments)) {
        const remap = remaps[`${node.id}::${slotName}`];
        if (remap) {
          assignments[slotName] = {endpointId: remap.endpointId, modelName: remap.modelName};
          changed = true;
        }
      }
      if (changed) {
        return {...node, config: {...node.config, modelSlotAssignments: assignments}};
      }
    }
    return node;
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
    nodes: applyModelRemapsToNodes(pipeline.nodes, remaps),
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
  return {
    ...capsule,
    id: newId,
    nodes: applyModelRemapsToNodes(capsule.nodes, remaps),
    updatedAt: now,
    createdAt: now,
  };
}

export function collectPipelineCapsuleRefs(
  pipeline: PipelineDefinition,
): Array<{nodeId: string; capsuleDefinitionId: string; capsuleVersion: string}> {
  return pipeline.nodes
    .filter((n): n is Extract<PipelineNode, {type: 'capsule-instance'}> => n.type === 'capsule-instance')
    .filter((n) => n.config.capsuleDefinitionId && n.config.capsuleVersion)
    .map((n) => ({
      nodeId: n.id,
      capsuleDefinitionId: n.config.capsuleDefinitionId,
      capsuleVersion: n.config.capsuleVersion,
    }));
}

function collectModelRefs(nodes: PipelineNode[]): MissingModelReference[] {
  const refs: MissingModelReference[] = [];
  for (const node of nodes) {
    if (node.type === 'model-call' && node.config.modelRef.kind === 'fixed') {
      const {endpointId, modelName} = node.config.modelRef;
      if (!endpointId && !modelName) continue;
      refs.push({
        key: node.id,
        nodeId: node.id,
        endpointId,
        modelName,
        label: `Model call ${node.title ?? node.id}`,
      });
    }
    if (node.type === 'capsule-instance') {
      for (const [slotName, assignment] of Object.entries(node.config.modelSlotAssignments)) {
        if (!assignment.endpointId && !assignment.modelName) continue;
        refs.push({
          key: `${node.id}::${slotName}`,
          nodeId: node.id,
          endpointId: assignment.endpointId,
          modelName: assignment.modelName,
          label: `Capsule slot ${slotName} (${node.title ?? node.id})`,
        });
      }
    }
  }
  return refs;
}

function findMissingModels(
  refs: MissingModelReference[],
  ctx: ImportContext,
): MissingModelReference[] {
  return refs.filter((ref) => {
    if (!ref.endpointId || !ref.modelName) return false;
    if (!ctx.knownEndpointIds.has(ref.endpointId)) return true;
    return !ctx.knownModelKeys.has(modelLookupKey(ref.endpointId, ref.modelName));
  });
}

function findMissingCapsules(
  nodes: PipelineNode[],
  includedCapsules: CapsuleDefinition[],
  ctx: ImportContext,
): MissingCapsuleReference[] {
  const includedKeys = new Set(
    includedCapsules.map((c) => capsuleLookupKey(c.id, c.version)),
  );
  const missing: MissingCapsuleReference[] = [];
  for (const node of nodes) {
    if (node.type !== 'capsule-instance') continue;
    const {capsuleDefinitionId, capsuleVersion} = node.config;
    if (!capsuleDefinitionId || !capsuleVersion) continue;
    const key = capsuleLookupKey(capsuleDefinitionId, capsuleVersion);
    if (includedKeys.has(key) || ctx.knownCapsuleKeys.has(key)) continue;
    missing.push({nodeId: node.id, capsuleDefinitionId, capsuleVersion});
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

function schemaVersionError(version: unknown, label: string): string | null {
  if (version !== CURRENT_SCHEMA_VERSION) {
    return `Unsupported ${label} schemaVersion: ${String(version)} (expected ${CURRENT_SCHEMA_VERSION})`;
  }
  return null;
}
