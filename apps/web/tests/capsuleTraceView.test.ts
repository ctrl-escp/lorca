import {describe, expect, it} from 'vitest';
import type {PipelineStep, PipelineTraceEvent, StepRunSnapshot} from '@lorca/core';
import {
  enrichTraceWithCapsuleSnapshots,
  isPriorRunTraceEvent,
  listInlineCapsuleTraceScopes,
} from '../src/utils/capsuleTraceView.js';

function modelStep(id: string): PipelineStep {
  return {
    id,
    type: 'model-call',
    label: id,
    enabled: true,
    outputNamespace: id,
    primaryOutputName: 'text',
    lastEditedAt: '2025-01-01T00:00:00.000Z',
    config: {type: 'model-call', modelRef: {kind: 'fixed', endpointId: 'ep', modelName: 'm'}, mode: 'generate', outputNames: ['text']},
  };
}

describe('capsuleTraceView', () => {
  it('lists inline capsule scopes from pipeline steps', () => {
    const steps: PipelineStep[] = [{
      id: 'cap_inst-1',
      type: 'capsule-instance',
      label: 'Expert',
      enabled: true,
      outputNamespace: 'capsule_instance',
      primaryOutputName: 'json',
      lastEditedAt: '2025-01-01T00:00:00.000Z',
      config: {
        type: 'capsule-instance',
        capsuleId: 'example-expert',
        capsuleVersion: 'v1',
        inputBindings: {},
        outputBindings: {},
        displayMode: 'inline',
        inlineSteps: [modelStep('domain'), modelStep('plan'), modelStep('answer')],
      },
    }];
    expect(listInlineCapsuleTraceScopes(steps)).toEqual([{
      capsuleInstanceId: 'cap_inst-1',
      innerSteps: steps[0]!.config.type === 'capsule-instance' ? steps[0]!.config.inlineSteps! : [],
    }]);
  });

  it('back-fills missing inner steps from nested snapshots', () => {
    const scopes = [{
      capsuleInstanceId: 'cap_inst-1',
      innerSteps: [modelStep('domain'), modelStep('plan'), modelStep('answer')],
    }];
    const trace: PipelineTraceEvent[] = [{
      runId: 'run-1',
      stepId: 'answer',
      nodeId: 'answer',
      capsuleInstanceId: 'cap_inst-1',
      status: 'completed',
      timestamp: '2025-01-02T00:00:00.000Z',
      outputArtifactNames: ['capsule_instance.internal.answer.text'],
    }];
    const snapshots: Record<string, StepRunSnapshot> = {
      'cap_inst-1:domain': {
        stepId: 'domain',
        inputSignature: 'a',
        configSignature: 'b',
        historyReadSignatures: {},
        outputArtifactRefs: ['capsule_instance.internal.domain.text'],
        completedAt: '2025-01-01T00:00:00.000Z',
        status: 'completed',
      },
      'cap_inst-1:plan': {
        stepId: 'plan',
        inputSignature: 'a',
        configSignature: 'b',
        historyReadSignatures: {},
        outputArtifactRefs: ['capsule_instance.internal.plan.text'],
        completedAt: '2025-01-01T00:00:01.000Z',
        status: 'completed',
      },
    };

    const enriched = enrichTraceWithCapsuleSnapshots(trace, snapshots, scopes);
    expect(enriched.some((e) => e.stepId === 'domain' && isPriorRunTraceEvent(e))).toBe(true);
    expect(enriched.some((e) => e.stepId === 'plan' && isPriorRunTraceEvent(e))).toBe(true);
    expect(enriched.some((e) => e.stepId === 'answer' && !isPriorRunTraceEvent(e))).toBe(true);
  });
});
