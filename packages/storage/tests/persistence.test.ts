import {describe, it, expect} from 'vitest';
import type {CapsuleDefinition} from '@lorca/core';
import {
  CAPSULE_SCHEMA_VERSION,
  normalizePersistedCapsule,
  capsuleNeedsPersistenceRewrite,
  isCapsuleImportSchemaVersion,
} from '../src/persistence.js';

function capsule(): CapsuleDefinition {
  return {
    schemaVersion: 2,
    id: 'cap-chain',
    name: 'Step Capsule',
    version: 'v1',
    status: 'locked',
    interface: {inputs: [], outputs: [{name: 'body', kind: 'text', sourceArtifactKey: 'body.text'}], parameters: [], modelSlots: []},
    steps: [{
      id: 'body',
      type: 'presentation',
      label: 'Body',
      enabled: true,
      outputNamespace: 'body',
      primaryOutputName: 'text',
      lastEditedAt: '2026-01-01T00:00:00.000Z',
      config: {type: 'presentation', text: 'hello', outputNames: ['text']},
    }],
    input: {raw: '', tagName: 'user', outputNamespace: 'user_prompt'},
    tests: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('persistence normalization', () => {
  it('accepts capsule import schema version 2 only', () => {
    expect(isCapsuleImportSchemaVersion(2)).toBe(true);
    expect(isCapsuleImportSchemaVersion(1)).toBe(false);
    expect(isCapsuleImportSchemaVersion(3)).toBe(false);
  });

  it('normalizes current capsule records', () => {
    const normalized = normalizePersistedCapsule(capsule());
    expect(normalized.schemaVersion).toBe(CAPSULE_SCHEMA_VERSION);
    expect(normalized.steps).toHaveLength(1);
    expect(normalized.input?.outputNamespace).toBe('user_prompt');
  });

  it('detects when a capsule record needs a persistence rewrite', () => {
    const before = capsule();
    delete before.input;
    const after = normalizePersistedCapsule(before);
    expect(capsuleNeedsPersistenceRewrite(before, after)).toBe(true);
    expect(capsuleNeedsPersistenceRewrite(after, after)).toBe(false);
  });

});
