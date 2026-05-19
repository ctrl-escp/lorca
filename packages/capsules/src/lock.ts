import type {CapsuleDefinition, PipelineError, Result} from '@lorca/core';
import {ok, err} from '@lorca/core';
import {validateCapsule} from './validate.js';

export function nextVersion(version: string): `v${number}` {
  const n = parseInt(version.slice(1), 10);
  return `v${n + 1}` as `v${number}`;
}

export function lockCapsule(def: CapsuleDefinition): Result<CapsuleDefinition, PipelineError> {
  if (def.status === 'locked') {
    return err({code: 'invalid_capsule_interface', message: 'Capsule is already locked'});
  }
  const validation = validateCapsule(def);
  if (!validation.ok) return validation;
  const now = new Date().toISOString();
  return ok({...def, status: 'locked', lockedAt: now, updatedAt: now});
}

export function createDraftFromLocked(def: CapsuleDefinition, newId: string): CapsuleDefinition {
  const now = new Date().toISOString();
  const {lockedAt: _removed, ...rest} = def;
  return {
    ...rest,
    id: newId,
    version: nextVersion(def.version),
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  };
}
