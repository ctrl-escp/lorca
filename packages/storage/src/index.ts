export type {PipelineExportFile, CapsuleExportFile} from '@lorca/core';

// Browser persistence (IndexedDB via Dexie), import/export, and schema migrations
// are implemented in Phase 11 (save/load) and Phase 12 (export/import).

// Every persisted document must include schemaVersion starting at 1.
export const CURRENT_SCHEMA_VERSION = 1 as const;
