import type {PipelineNode, PipelineEdge, PipelineOutputRef} from './pipeline.js';

/** Legacy V1 graph-backed pipeline — load/migration tests only; not part of the public app API. */
export interface LegacyPipelineDefinition {
  schemaVersion: 1;
  id: string;
  name: string;
  description?: string;
  inputArtifactName: string;
  nodes: PipelineNode[];
  edges: PipelineEdge[];
  outputRef: PipelineOutputRef;
  createdAt: string;
  updatedAt: string;
}

export interface LegacyPipelineExportFile {
  exportedAt: string;
  app: 'lorca';
  kind: 'pipeline';
  pipeline: LegacyPipelineDefinition;
  includedCapsules?: unknown[];
  stepOutputs?: unknown;
}

/** IndexedDB rows that still carry graph fields before normalization. */
export interface LegacyGraphCapsuleRecord {
  nodes?: PipelineNode[];
  edges?: PipelineEdge[];
  outputRef?: PipelineOutputRef;
}
