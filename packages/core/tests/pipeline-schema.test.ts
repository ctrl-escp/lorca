import {describe, it, expect} from 'vitest';
import type {
  PipelineDefinition,
  CapsuleDefinition,
  CapsuleInterface,
  AiEndpointConfig,
  PipelineError,
  CapsuleTestRunSummary,
} from '../src/index.js';
import {ok, err, CAPSULE_LOOP_MAX_COUNT} from '../src/index.js';

// ── Pipeline fixtures ─────────────────────────────────────────────────────────

function makeMinimalPipeline(): PipelineDefinition {
  const now = '2026-01-01T00:00:00Z';
  return {
    schemaVersion: 2,
    id: 'pipe-1',
    name: 'Test Pipeline',
    input: {raw: '', tagName: 'user', outputNamespace: 'user_prompt'},
    steps: [
      {
        id: 'model-1',
        type: 'model-call',
        label: 'Main Model Call',
        enabled: true,
        outputNamespace: 'answer',
        primaryOutputName: 'text',
        lastEditedAt: now,
        config: {
          type: 'model-call',
          modelRef: {kind: 'fixed', endpointId: 'ep-1', modelName: 'llama3'},
          mode: 'generate',
          outputNames: ['text', 'rawResponse'],
        },
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

function makeMinimalCapsule(): CapsuleDefinition {
  const now = '2026-01-01T00:00:00Z';
  return {
    schemaVersion: 2,
    id: 'cap-1',
    name: 'Test Capsule',
    version: 'v1',
    status: 'draft',
    interface: {
      inputs: [{name: 'source_text', kind: 'text', required: true}],
      outputs: [{name: 'result', kind: 'text', sourceArtifactKey: 'result.text'}],
      parameters: [],
      modelSlots: [{name: 'main_model', suggestedBuckets: ['general'], required: true}],
    },
    steps: [{
      id: 'model-1',
      type: 'model-call',
      label: 'Model',
      enabled: true,
      outputNamespace: 'result',
      primaryOutputName: 'text',
      lastEditedAt: now,
      config: {
        type: 'model-call',
        modelRef: {kind: 'slot', slotName: 'main_model'},
        mode: 'generate',
        outputNames: ['text', 'rawResponse'],
      },
    }],
    input: {raw: '', tagName: 'user', outputNamespace: 'user_prompt'},
    tests: [],
    createdAt: now,
    updatedAt: now,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PipelineDefinition (step-chain)', () => {
  it('accepts a minimal valid pipeline', () => {
    const pipeline = makeMinimalPipeline();
    expect(pipeline.schemaVersion).toBe(2);
    expect(pipeline.steps).toHaveLength(1);
    expect(pipeline.input.outputNamespace).toBe('user_prompt');
  });

  it('step has required fields', () => {
    const step = makeMinimalPipeline().steps[0]!;
    expect(step.id).toBe('model-1');
    expect(step.primaryOutputName).toBe('text');
    expect(step.outputNamespace).toBe('answer');
    expect(step.enabled).toBe(true);
  });

  it('step config carries outputNames', () => {
    const step = makeMinimalPipeline().steps[0]!;
    if (step.config.type === 'model-call') {
      expect(step.config.outputNames).toContain('text');
      expect(step.config.outputNames).toContain('rawResponse');
    }
  });

  it('primaryOutputName is in outputNames', () => {
    const step = makeMinimalPipeline().steps[0]!;
    const config = step.config;
    if (config.type !== 'capsule-instance') {
      expect(config.outputNames).toContain(step.primaryOutputName);
    }
  });

  it('accepts pipeline with no steps (empty)', () => {
    const pipeline: PipelineDefinition = {
      schemaVersion: 2,
      id: 'p2',
      name: 'Empty',
      input: {raw: '', tagName: 'user', outputNamespace: 'user_prompt'},
      steps: [],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    expect(pipeline.steps).toHaveLength(0);
  });

  it('accepts outputStepId field', () => {
    const pipeline: PipelineDefinition = {
      ...makeMinimalPipeline(),
      outputStepId: 'model-1',
    };
    expect(pipeline.outputStepId).toBe('model-1');
  });
});

describe('CapsuleDefinition schema', () => {
  it('accepts a minimal valid Capsule', () => {
    const cap = makeMinimalCapsule();
    expect(cap.schemaVersion).toBe(2);
    expect(cap.version).toBe('v1');
    expect(cap.status).toBe('draft');
    expect(cap.steps).toHaveLength(1);
  });

  it('accepts canonical schemaVersion 2 capsules', () => {
    const cap: CapsuleDefinition = {
      ...makeMinimalCapsule(),
      schemaVersion: 2,
      steps: [],
    };
    expect(cap.schemaVersion).toBe(2);
  });

  it('validates a preprocess-model-postprocess step-chain shape', () => {
    const cap = makeMinimalCapsule();
    expect(cap.steps).toHaveLength(1);
    expect(cap.steps[0]?.type).toBe('model-call');
  });
});

describe('CapsuleInterface schema', () => {
  it('validates input ports', () => {
    const iface: CapsuleInterface = {
      inputs: [
        {name: 'source_text', kind: 'text', required: true},
        {name: 'context', kind: 'json', required: false, description: 'optional context'},
      ],
      outputs: [{name: 'extracted_json', kind: 'json'}],
      parameters: [
        {name: 'strict_json', kind: 'boolean', required: false, default: false},
        {name: 'extraction_goal', kind: 'text', required: true},
      ],
      modelSlots: [
        {name: 'extractor_model', suggestedBuckets: ['tiny', 'extract-json'], required: true},
      ],
    };
    expect(iface.inputs).toHaveLength(2);
    expect(iface.parameters[0]?.name).toBe('strict_json');
    expect(iface.modelSlots[0]?.suggestedBuckets).toContain('extract-json');
  });
});

describe('AiEndpointConfig schema', () => {
  it('validates endpoint with no auth', () => {
    const ep: AiEndpointConfig = {
      id: 'ep-1',
      name: 'Local Ollama',
      baseUrl: 'http://localhost:11434',
      kind: 'ollama',
      enabled: true,
      browserAccess: 'unknown',
      authKind: 'none',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    expect(ep.authKind).toBe('none');
    expect(ep.authSecretRef).toBeUndefined();
  });

  it('validates endpoint with bearer token auth', () => {
    const ep: AiEndpointConfig = {
      id: 'ep-2',
      name: 'Remote API',
      baseUrl: 'https://api.example.com',
      kind: 'openai-compatible',
      enabled: true,
      browserAccess: 'unknown',
      authKind: 'bearer-token',
      authSecretRef: 'secret-ref-1',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    expect(ep.authSecretRef).toBe('secret-ref-1');
  });
});

describe('PipelineError and CapsuleTestRunSummary', () => {
  it('constructs a PipelineError', () => {
    const error: PipelineError = {
      code: 'missing_artifact',
      message: 'Artifact criteria.json not found',
      nodeId: 'model-1',
    };
    expect(error.code).toBe('missing_artifact');
  });

  it('constructs a CapsuleTestRunSummary with error', () => {
    const summary: CapsuleTestRunSummary = {
      runId: 'run-1',
      ranAt: '2026-01-01T00:00:00Z',
      passed: false,
      failedNodeId: 'model-1',
      error: {code: 'model_call_failed', message: 'Endpoint unreachable', nodeId: 'model-1'},
    };
    expect(summary.passed).toBe(false);
    expect(summary.error?.code).toBe('model_call_failed');
  });

  it('constructs a passing CapsuleTestRunSummary', () => {
    const summary: CapsuleTestRunSummary = {
      runId: 'run-2',
      ranAt: '2026-01-01T00:00:00Z',
      passed: true,
    };
    expect(summary.passed).toBe(true);
    expect(summary.error).toBeUndefined();
  });
});

describe('Result type', () => {
  it('ok wraps a value', () => {
    const result = ok(42);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(42);
    }
  });

  it('err wraps an error', () => {
    const error: PipelineError = {code: 'cycle_detected', message: 'Graph has a cycle'};
    const result = err(error);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('cycle_detected');
    }
  });
});

describe('Runtime constants', () => {
  it('CAPSULE_LOOP_MAX_COUNT is 10', () => {
    expect(CAPSULE_LOOP_MAX_COUNT).toBe(10);
  });
});
