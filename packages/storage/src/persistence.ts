import type {CapsuleDefinition, LegacyPipelineDefinition, PipelineDefinition} from '@lorca/core';
import {
  ensureCapsuleStepChain,
  migrateLegacyPipeline,
  migrateManualTextSteps,
  stripCapsuleLegacyGraphFields,
} from '@lorca/pipeline';

/** Canonical persisted/exported capsule schema (step-chain body, no legacy graph fields). */
export const CAPSULE_SCHEMA_VERSION = 2 as const;

/** Capsule export versions accepted at import boundaries (v1 graph-only is migrated immediately). */
export const CAPSULE_IMPORT_SCHEMA_VERSIONS = [1, 2] as const;

/** Dexie database schema version (includes one-time capsule/pipeline normalization). */
export const DB_SCHEMA_VERSION = 2;

export function isCapsuleImportSchemaVersion(version: unknown): version is 1 | 2 {
  return version === 1 || version === 2;
}

export function isLegacyPipelineRecord(def: unknown): def is LegacyPipelineDefinition {
  return (
    typeof def === 'object' &&
    def !== null &&
    (def as {schemaVersion?: unknown}).schemaVersion === 1 &&
    'nodes' in def
  );
}

/** Migrate and strip legacy graph fields; bump capsule schemaVersion for step-chain bodies. */
export function normalizePersistedCapsule(capsule: CapsuleDefinition): CapsuleDefinition {
  const body = stripCapsuleLegacyGraphFields(ensureCapsuleStepChain(capsule));
  if (body.schemaVersion === CAPSULE_SCHEMA_VERSION) return body;
  return {...body, schemaVersion: CAPSULE_SCHEMA_VERSION};
}

/** Migrate legacy V1 graph pipelines to V2 step chains on load/persistence. */
export function normalizePersistedPipeline(
  def: PipelineDefinition | LegacyPipelineDefinition,
): PipelineDefinition {
  const v2 = isLegacyPipelineRecord(def) ? migrateLegacyPipeline(def) : def;
  return migrateManualTextSteps(v2);
}

export function capsuleNeedsPersistenceRewrite(
  before: CapsuleDefinition,
  after: CapsuleDefinition,
): boolean {
  if (before.schemaVersion !== after.schemaVersion) return true;
  if (after.steps === undefined) return false;
  return (
    Object.prototype.hasOwnProperty.call(before, 'nodes') ||
    Object.prototype.hasOwnProperty.call(before, 'edges') ||
    Object.prototype.hasOwnProperty.call(before, 'outputRef')
  );
}

export function pipelineNeedsPersistenceRewrite(before: unknown): boolean {
  return isLegacyPipelineRecord(before);
}
