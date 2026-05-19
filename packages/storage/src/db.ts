import Dexie, {type Table} from 'dexie';
import type {AiEndpointConfig, DiscoveredModel, PipelineDefinition, CapsuleDefinition} from '@lorca/core';

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
  }
}

// Singleton — one Dexie instance per browser context
let _db: LorcaDb | null = null;

export function getDb(): LorcaDb {
  if (!_db) _db = new LorcaDb();
  return _db;
}
