import Dexie, {type Table} from 'dexie';
import type {AiEndpointConfig, DiscoveredModel, PipelineDefinition, CapsuleDefinition} from '@lorca/core';
import {DB_SCHEMA_VERSION, normalizePersistedCapsule, normalizePersistedPipeline} from './persistence.js';

export class LorcaDb extends Dexie {
  endpoints!: Table<AiEndpointConfig, string>;
  models!: Table<DiscoveredModel, string>;
  pipelines!: Table<PipelineDefinition, string>;
  capsules!: Table<CapsuleDefinition, string>;

  constructor() {
    super('lorca');
    this.version(1).stores({
      endpoints: 'id, kind, enabled',
      models: 'id, endpointId, source',
      pipelines: 'id, name, updatedAt',
      capsules: 'id, name, version, status, updatedAt',
    });
    this.version(DB_SCHEMA_VERSION).stores({
      endpoints: 'id, kind, enabled',
      models: 'id, endpointId, source',
      pipelines: 'id, name, updatedAt',
      capsules: 'id, name, version, status, updatedAt',
    }).upgrade(async (tx) => {
      const capsuleTable = tx.table<CapsuleDefinition, string>('capsules');
      for (const cap of await capsuleTable.toArray()) {
        await capsuleTable.put(normalizePersistedCapsule(cap));
      }

      const pipelineTable = tx.table('pipelines');
      for (const pipe of await pipelineTable.toArray()) {
        await pipelineTable.put(normalizePersistedPipeline(pipe));
      }
    });
  }
}

// Singleton — one Dexie instance per browser context
let _db: LorcaDb | null = null;

export function getDb(): LorcaDb {
  if (!_db) _db = new LorcaDb();
  return _db;
}
