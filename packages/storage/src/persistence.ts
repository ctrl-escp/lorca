import type {CapsuleDefinition, PipelineDefinition} from '@lorca/core';
import type {LegacyGraphCapsuleRecord, LegacyPipelineDefinition} from '@lorca/core/legacy';
import {
  ensureCapsuleStepChain,
  migrateManualTextSteps,
  stripCapsuleLegacyGraphFields,
} from '@lorca/pipeline';
import {migrateLegacyPipeline} from '@lorca/pipeline/legacyGraph';

/** Canonical persisted/exported capsule schema (step-chain body, no legacy graph fields). */
export const CAPSULE_SCHEMA_VERSION = 2 as const;

/** Capsule export versions accepted at import boundaries. */
export const CAPSULE_IMPORT_SCHEMA_VERSIONS = [2] as const;

/** Dexie database schema version (includes one-time capsule/pipeline normalization). */
export const DB_SCHEMA_VERSION = 2;

export function isCapsuleImportSchemaVersion(version: unknown): version is 2 {
  return version === 2;
}

export function isLegacyPipelineRecord(def: unknown): def is LegacyPipelineDefinition {
  return (
    typeof def === 'object' &&
    def !== null &&
    (def as {schemaVersion?: unknown}).schemaVersion === 1 &&
    'nodes' in def
  );
}

type StoredCapsuleRecord = CapsuleDefinition & LegacyGraphCapsuleRecord;

function migrateGraphOnlyCapsuleAtLoad(capsule: StoredCapsuleRecord): CapsuleDefinition {
  if ((capsule.steps?.length ?? 0) > 0 || !(capsule.nodes?.length ?? 0)) {
    return capsule;
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
  return {
    ...capsule,
    input: migrated.input,
    steps: migrated.steps,
  };
}

/** Migrate and strip legacy graph fields; bump capsule schemaVersion for step-chain bodies. */
export function normalizePersistedCapsule(capsule: StoredCapsuleRecord): CapsuleDefinition {
  const migrated = migrateGraphOnlyCapsuleAtLoad(capsule);
  const body = stripCapsuleLegacyGraphFields(ensureCapsuleStepChain(migrated));
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
  before: StoredCapsuleRecord,
  after: CapsuleDefinition,
): boolean {
  if (before.schemaVersion !== after.schemaVersion) return true;
  return (
    Object.prototype.hasOwnProperty.call(before, 'nodes') ||
    Object.prototype.hasOwnProperty.call(before, 'edges') ||
    Object.prototype.hasOwnProperty.call(before, 'outputRef')
  );
}

export function pipelineNeedsPersistenceRewrite(before: unknown): boolean {
  return isLegacyPipelineRecord(before);
}
