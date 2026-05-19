import {ref} from 'vue';
import {defineStore} from 'pinia';
import type {
  CapsuleDefinition,
  PipelineDefinition,
  PipelineExportFile,
  CapsuleExportFile,
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

export type PendingImport =
  | {kind: 'pipeline'; preview: PipelineImportPreview}
  | {kind: 'capsule'; preview: CapsuleImportPreview};

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
    for (const ref of refs) {
      const key = `${ref.capsuleDefinitionId}::${ref.capsuleVersion}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const cap = capsulesStore.getCapsule(ref.capsuleDefinitionId, ref.capsuleVersion);
      if (cap) result.push(cap);
    }
    return result;
  }

  function exportCurrentPipeline(pipeline: PipelineDefinition) {
    const file = exportPipeline(pipeline, resolveIncludedCapsules(pipeline));
    downloadJson(`${sanitizeFilename(pipeline.name)}.pipeline.json`, file);
  }

  function exportCurrentCapsule(capsule: CapsuleDefinition) {
    const file = exportCapsule(capsule);
    downloadJson(`${sanitizeFilename(capsule.name)}.${capsule.version}.capsule.json`, file);
  }

  function parseImportJson(text: string): unknown {
    return JSON.parse(text) as unknown;
  }

  function beginPipelineImport(data: unknown): boolean {
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
    pendingImport.value = {kind: 'pipeline', preview};
    return true;
  }

  function beginCapsuleImport(data: unknown): boolean {
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
    pendingImport.value = {kind: 'capsule', preview};
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
