import type {CapsuleDefinition} from '@lorca/core';
import {normalizeCapsuleStepChain} from '@lorca/pipeline';

/** Canonical persisted/exported capsule schema. */
export const CAPSULE_SCHEMA_VERSION = 2 as const;

/** Capsule export versions accepted at import boundaries. */
export const CAPSULE_IMPORT_SCHEMA_VERSIONS = [2] as const;

/** Dexie database schema version. */
export const DB_SCHEMA_VERSION = 2;

export function isCapsuleImportSchemaVersion(version: unknown): version is 2 {
  return version === 2;
}

export function normalizePersistedCapsule(capsule: CapsuleDefinition): CapsuleDefinition {
  return normalizeCapsuleStepChain(capsule);
}

export function capsuleNeedsPersistenceRewrite(
  before: CapsuleDefinition,
  after: CapsuleDefinition,
): boolean {
  return before.input !== after.input;
}
