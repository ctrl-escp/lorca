import {describe, expect, it} from 'vitest';
import type {PipelineTraceEvent} from '@lorca/core';
import {
  resolveCapsuleInnerStepExecution,
  resolveTopLevelStepExecution,
  traceEventsForStep,
} from '../src/utils/stepExecutionDisplay.js';

function ev(
  partial: Partial<PipelineTraceEvent> & Pick<PipelineTraceEvent, 'status'>,
): PipelineTraceEvent {
  return {
    runId: 'run-1',
    stepId: 'step-a',
    nodeId: 'step-a',
    timestamp: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('traceEventsForStep', () => {
  it('filters top-level events and excludes capsule-scoped ones', () => {
    const trace = [
      ev({status: 'started'}),
      ev({status: 'completed', stepId: 'inner', nodeId: 'inner', capsuleInstanceId: 'cap-1'}),
    ];
    expect(traceEventsForStep(trace, 'step-a', {topLevelOnly: true})).toHaveLength(1);
    expect(traceEventsForStep(trace, 'inner', {capsuleInstanceId: 'cap-1'})).toHaveLength(1);
  });
});

describe('resolveTopLevelStepExecution', () => {
  it('returns running while step has started but not finished', () => {
    const chip = resolveTopLevelStepExecution('step-a', [ev({status: 'started'})], {runStatus: 'running'});
    expect(chip?.phase).toBe('running');
    expect(chip?.label).toBe('Running');
  });

  it('returns done after completion', () => {
    const chip = resolveTopLevelStepExecution(
      'step-a',
      [ev({status: 'started'}), ev({status: 'completed', durationMs: 1500})],
      {runStatus: 'completed'},
    );
    expect(chip?.phase).toBe('completed');
    expect(chip?.label).toBe('Done');
    expect(chip?.title).toContain('00:01.500');
  });

  it('prefers failed over later completed events', () => {
    const chip = resolveTopLevelStepExecution(
      'step-a',
      [
        ev({status: 'started'}),
        ev({status: 'failed', error: {code: 'model_error', message: 'timeout'}}),
        ev({status: 'completed'}),
      ],
      {runStatus: 'failed'},
    );
    expect(chip?.phase).toBe('failed');
  });

  it('surfaces inner capsule failure on the capsule instance step', () => {
    const chip = resolveTopLevelStepExecution(
      'cap-1',
      [
        ev({status: 'started', stepId: 'cap-1', nodeId: 'cap-1'}),
        ev({
          status: 'failed',
          stepId: 'inner-1',
          nodeId: 'inner-1',
          capsuleInstanceId: 'cap-1',
          error: {code: 'model_error', message: 'bad output'},
        }),
      ],
      {runStatus: 'running', capsuleHasInnerFailure: true},
    );
    expect(chip?.phase).toBe('failed');
  });
});

describe('resolveCapsuleInnerStepExecution', () => {
  it('returns running for an inner step currently executing', () => {
    const chip = resolveCapsuleInnerStepExecution(
      'cap-1',
      'inner-1',
      [ev({status: 'started', stepId: 'inner-1', nodeId: 'inner-1', capsuleInstanceId: 'cap-1'})],
      {},
      'running',
    );
    expect(chip?.phase).toBe('running');
  });

  it('falls back to snapshot when trace is empty after run', () => {
    const chip = resolveCapsuleInnerStepExecution(
      'cap-1',
      'inner-1',
      [],
      {'cap-1:inner-1': {
        stepId: 'inner-1',
        inputSignature: 'a',
        configSignature: 'b',
        historyReadSignatures: {},
        outputArtifactRefs: [],
        completedAt: '2026-01-01T00:00:00.000Z',
        status: 'completed',
      }},
      'completed',
    );
    expect(chip?.phase).toBe('completed');
  });
});
