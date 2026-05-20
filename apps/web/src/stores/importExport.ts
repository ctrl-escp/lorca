import {ref} from 'vue';
import {defineStore} from 'pinia';
import type {
  CapsuleDefinition,
  PipelineDefinition,
  PipelineExportFile,
  CapsuleExportFile,
  StepOutputsExport,
} from '@lorca/core';
import {
  exportPipeline,
  exportCapsule,
  parsePipelineExport,
  parseCapsuleExport,
  previewPipelineImport,
  previewCapsuleImport,
  prepareImportedPipeline,
  prepareImportedCapsule,
  collectPipelineCapsuleRefs,
  type ImportContext,
  type MissingModelReference,
  type MissingCapsuleReference,
  type ModelRemap,
  type ImportParseError,
  type PipelineImportPreview,
  type CapsuleImportPreview,
} from '@lorca/storage';
import {useEndpointsStore} from './endpoints.js';
import {useModelsStore} from './models.js';
import {useCapsulesStore} from './capsules.js';
import {usePipelinesStore} from './pipelines.js';
import {newId} from '../utils/id.js';
import {saveRunState, saveCapsuleRunState} from '../utils/runPersistence.js';

export type PendingImport =
  | {kind: 'pipeline'; preview: PipelineImportPreview; stepOutputs?: StepOutputsExport}
  | {kind: 'capsule'; preview: CapsuleImportPreview; stepOutputs?: StepOutputsExport};

export const useImportExportStore = defineStore('importExport', () => {
  const pendingImport = ref<PendingImport | null>(null);
  const importErrors = ref<string[]>([]);

  function buildContext(): ImportContext {
    const endpoints = useEndpointsStore().endpoints;
    const models = useModelsStore().models;
    const capsules = useCapsulesStore().capsules;
    return {
      knownEndpointIds: new Set(endpoints.map((e) => e.id)),
      knownModelKeys: new Set(models.map((m) => `${m.endpointId}::${m.providerModelName}`)),
      knownCapsuleKeys: new Set(capsules.map((c) => `${c.id}::${c.version}`)),
    };
  }

  function resolveIncludedCapsules(pipeline: PipelineDefinition): CapsuleDefinition[] {
    const capsulesStore = useCapsulesStore();
    const refs = collectPipelineCapsuleRefs(pipeline);
    const seen = new Set<string>();
    const result: CapsuleDefinition[] = [];
    for (const capsuleRef of refs) {
      const key = `${capsuleRef.capsuleDefinitionId}::${capsuleRef.capsuleVersion}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const cap = capsulesStore.getCapsule(capsuleRef.capsuleDefinitionId, capsuleRef.capsuleVersion);
      if (cap) result.push(cap);
    }
    return result;
  }

  function exportCurrentPipeline(pipeline: PipelineDefinition, stepOutputs?: StepOutputsExport | null) {
    const file = exportPipeline(pipeline, resolveIncludedCapsules(pipeline), stepOutputs);
    downloadJson(`${sanitizeFilename(pipeline.name)}.pipeline.json`, file);
  }

  function exportCurrentCapsule(capsule: CapsuleDefinition, stepOutputs?: StepOutputsExport | null) {
    const file = exportCapsule(capsule, stepOutputs);
    downloadJson(`${sanitizeFilename(capsule.name)}.${capsule.version}.capsule.json`, file);
  }

  function buildPipelineExportJson(
    pipeline: PipelineDefinition,
    stepOutputs?: StepOutputsExport | null,
  ): {json: string; filename: string} {
    const file = exportPipeline(pipeline, resolveIncludedCapsules(pipeline), stepOutputs);
    return {
      json: JSON.stringify(file, null, 2),
      filename: `${sanitizeFilename(pipeline.name)}.json`,
    };
  }

  function buildCapsuleExportJson(
    capsule: CapsuleDefinition,
    stepOutputs?: StepOutputsExport | null,
  ): {json: string; filename: string} {
    const file = exportCapsule(capsule, stepOutputs);
    return {
      json: JSON.stringify(file, null, 2),
      filename: `${sanitizeFilename(capsule.name)}.${capsule.version}.json`,
    };
  }

  function parseImportJson(text: string): unknown {
    return JSON.parse(text) as unknown;
  }

  function beginPipelineImport(data: unknown, includeStepOutputs = false): boolean {
    importErrors.value = [];
    const parsed = parsePipelineExport(data);
    if (isParseError(parsed)) {
      importErrors.value = parsed.errors;
      pendingImport.value = null;
      return false;
    }
    const preview = previewPipelineImport(parsed, buildContext());
    if (isParseError(preview)) {
      importErrors.value = preview.errors;
      pendingImport.value = null;
      return false;
    }
    if (preview.missingCapsules.length > 0) {
      importErrors.value = preview.missingCapsules.map(
        (m) => `Missing Capsule ${m.capsuleDefinitionId} ${m.capsuleVersion} (node ${m.nodeId})`,
      );
      pendingImport.value = null;
      return false;
    }
    pendingImport.value = {
      kind: 'pipeline',
      preview,
      ...(includeStepOutputs && parsed.stepOutputs ? {stepOutputs: parsed.stepOutputs} : {}),
    };
    return true;
  }

  function beginCapsuleImport(data: unknown, includeStepOutputs = false): boolean {
    importErrors.value = [];
    const parsed = parseCapsuleExport(data);
    if (isParseError(parsed)) {
      importErrors.value = parsed.errors;
      pendingImport.value = null;
      return false;
    }
    const preview = previewCapsuleImport(parsed, buildContext());
    if (isParseError(preview)) {
      importErrors.value = preview.errors;
      pendingImport.value = null;
      return false;
    }
    pendingImport.value = {
      kind: 'capsule',
      preview,
      ...(includeStepOutputs && parsed.stepOutputs ? {stepOutputs: parsed.stepOutputs} : {}),
    };
    return true;
  }

  async function confirmImport(remaps: Record<string, ModelRemap>): Promise<{kind: 'pipeline'; id: string} | {kind: 'capsule'; id: string} | null> {
    const pending = pendingImport.value;
    if (!pending) return null;
    pendingImport.value = null;
    importErrors.value = [];

    if (pending.kind === 'pipeline') {
      const pipelinesStore = usePipelinesStore();
      const capsulesStore = useCapsulesStore();
      for (const cap of pending.preview.includedCapsules) {
        const existing = capsulesStore.getCapsule(cap.id, cap.version);
        if (!existing) {
          capsulesStore.addCapsule(prepareImportedCapsule(cap, cap.id, {}));
        }
      }
      const pipeline = prepareImportedPipeline(
        pending.preview.pipeline,
        newId('pipeline'),
        remaps,
      );
      await pipelinesStore.save(pipeline);
      if (pending.stepOutputs) saveRunState(pipeline.id, pending.stepOutputs);
      pipelinesStore.setActive(pipeline.id);
      return {kind: 'pipeline', id: pipeline.id};
    }

    const capsulesStore = useCapsulesStore();
    const capsule = prepareImportedCapsule(
      pending.preview.capsule,
      newId('cap'),
      remaps,
    );
    capsulesStore.addCapsule(capsule);
    if (pending.stepOutputs) saveCapsuleRunState(capsule.id, pending.stepOutputs);
    return {kind: 'capsule', id: capsule.id};
  }

  function cancelImport() {
    pendingImport.value = null;
    importErrors.value = [];
  }

  function setImportErrors(errors: string[]) {
    importErrors.value = errors;
    pendingImport.value = null;
  }

  return {
    pendingImport,
    importErrors,
    exportCurrentPipeline,
    exportCurrentCapsule,
    buildPipelineExportJson,
    buildCapsuleExportJson,
    parseImportJson,
    beginPipelineImport,
    beginCapsuleImport,
    confirmImport,
    cancelImport,
    setImportErrors,
  };
});

function isParseError(value: unknown): value is ImportParseError {
  return typeof value === 'object' && value !== null && 'ok' in value && (value as ImportParseError).ok === false;
}

function sanitizeFilename(name: string): string {
  return name.trim().replace(/[^\w.-]+/g, '_') || 'lorca-export';
}

function downloadJson(filename: string, data: PipelineExportFile | CapsuleExportFile) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export type {MissingModelReference, MissingCapsuleReference, ModelRemap};
