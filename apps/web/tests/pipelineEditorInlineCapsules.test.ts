import {beforeEach, describe, expect, it, vi} from 'vitest';
import {createPinia, setActivePinia} from 'pinia';
import type {CapsuleDefinition, PipelineDefinition, PipelineStep} from '@lorca/core';
import {computeCapsuleContentSignature} from '@lorca/pipeline';
import {useCapsulesStore} from '../src/stores/capsules.js';
import {usePipelineEditorStore} from '../src/stores/pipelineEditor.js';
import {reconcileInlineCapsuleSlotRefs} from '../src/utils/inlineCapsuleRun.js';

const tables = {
  capsules: new Map<string, CapsuleDefinition>(),
  pipelines: new Map<string, PipelineDefinition>(),
};

vi.mock('@lorca/storage', () => ({
  getDb: () => ({
    capsules: {
      put: async (cap: CapsuleDefinition) => { tables.capsules.set(cap.id, cap); },
      delete: async (id: string) => { tables.capsules.delete(id); },
      toArray: async () => [...tables.capsules.values()],
    },
    pipelines: {
      put: async (pipe: PipelineDefinition) => { tables.pipelines.set(pipe.id, pipe); },
      delete: async (id: string) => { tables.pipelines.delete(id); },
      toArray: async () => [...tables.pipelines.values()],
    },
  }),
}));

function textStep(id: string, text: string, outputNamespace = id): PipelineStep {
  return {
    id,
    type: 'presentation',
    label: id,
    enabled: true,
    outputNamespace,
    primaryOutputName: 'text',
    lastEditedAt: '2025-01-01T00:00:00.000Z',
    config: {type: 'presentation', text, outputNames: ['text']},
  };
}

function capsule(): CapsuleDefinition {
  const body = textStep('body', 'saved body', 'body');
  return {
    schemaVersion: 1,
    id: 'cap',
    name: 'Test Capsule',
    version: 'v1',
    status: 'locked',
    interface: {
      inputs: [],
      outputs: [{name: 'result', kind: 'text', sourceArtifactKey: 'body.text'}],
      parameters: [],
      modelSlots: [],
    },
    nodes: [],
    edges: [],
    outputRef: {nodeId: 'body', outputName: 'text'},
    steps: [body],
    input: {raw: '', tagName: 'user_prompt', outputNamespace: 'user_prompt'},
    tests: [],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  };
}

function pipeline(steps: PipelineStep[]): PipelineDefinition {
  return {
    schemaVersion: 2,
    id: 'pipe',
    name: 'Pipeline',
    input: {raw: '', tagName: 'user_prompt', outputNamespace: 'user_prompt'},
    steps,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  };
}

function capsuleInstance(cap: CapsuleDefinition): PipelineStep {
  return {
    id: 'inst',
    type: 'capsule-instance',
    label: cap.name,
    enabled: true,
    outputNamespace: 'cap',
    primaryOutputName: 'text',
    lastEditedAt: '2025-01-01T00:00:00.000Z',
    config: {
      type: 'capsule-instance',
      capsuleId: cap.id,
      capsuleVersion: cap.version,
      inputBindings: {},
      outputBindings: {result: 'cap.text'},
      boundContentSignature: computeCapsuleContentSignature(cap),
    },
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  tables.capsules.clear();
  tables.pipelines.clear();
});

describe('pipeline editor inline capsule actions', () => {
  it('spreads, edits, and collapses an inline capsule working copy', () => {
    const cap = capsule();
    useCapsulesStore().addCapsule(cap);
    const editor = usePipelineEditorStore();
    editor.loadPipeline(pipeline([capsuleInstance(cap)]));

    expect(editor.spreadCapsule('inst')).toEqual({ok: true});
    const spread = editor.steps[0]!;
    expect(spread.config.type).toBe('capsule-instance');
    if (spread.config.type !== 'capsule-instance') return;
    expect(spread.config.displayMode).toBe('inline');
    expect(spread.config.inlineSteps?.[0]?.label).toBe('body');
    expect(editor.selectedInlineCapsuleInnerStepId).toBe('body');

    editor.commitInlineCapsuleInnerStepEdit('inst', 'body', {label: 'Edited'}, 'Edit inline');
    const edited = editor.steps[0]!;
    expect(edited.config.type).toBe('capsule-instance');
    if (edited.config.type !== 'capsule-instance') return;
    expect(edited.config.inlineModified).toBe(true);
    expect(edited.config.inlineSteps?.[0]?.label).toBe('Edited');

    editor.collapseInlineCapsule('inst');
    const collapsed = editor.steps[0]!;
    expect(collapsed.config.type).toBe('capsule-instance');
    if (collapsed.config.type !== 'capsule-instance') return;
    expect(collapsed.config.displayMode).toBe('opaque');
    expect(collapsed.config.inlineSteps?.[0]?.label).toBe('Edited');
  });

  it('namespaces capsule output bindings under the instance prefix', () => {
    const cap: CapsuleDefinition = {
      ...capsule(),
      interface: {
        inputs: [],
        outputs: [
          {name: 'expert_answer', kind: 'text', sourceArtifactKey: 'answer.text'},
          {name: 'verification_json', kind: 'json', sourceArtifactKey: 'verify.json'},
        ],
        parameters: [],
        modelSlots: [],
      },
    };
    useCapsulesStore().addCapsule(cap);
    const editor = usePipelineEditorStore();
    editor.loadPipeline(pipeline([]));
    const stepId = editor.insertCapsuleInstance(cap);
    expect(stepId).toBeTruthy();
    const step = editor.steps.find((s) => s.id === stepId)!;
    expect(step.config.type).toBe('capsule-instance');
    if (step.config.type !== 'capsule-instance') return;
    expect(step.primaryOutputName).toBe('json');
    expect(step.config.outputBindings).toEqual({
      expert_answer: `${step.outputNamespace}.text`,
      verification_json: `${step.outputNamespace}.json`,
    });
  });

  it('detaches inline steps and remaps namespace collisions', () => {
    const cap = capsule();
    useCapsulesStore().addCapsule(cap);
    const editor = usePipelineEditorStore();
    const instance = capsuleInstance(cap);
    instance.config = {
      ...instance.config,
      displayMode: 'inline',
      inlineSteps: [textStep('body', '{{artifact.body.text}}', 'body')],
    };
    editor.loadPipeline(pipeline([textStep('source', 'parent', 'body'), instance]));

    const result = editor.detachCapsule('inst');
    expect(result).toEqual({ok: true});
    expect(editor.steps).toHaveLength(2);
    expect(editor.steps[1]?.outputNamespace).toBe('body_2');
    expect(editor.steps[1]?.config.type).toBe('presentation');
    if (editor.steps[1]?.config.type !== 'presentation') return;
    expect(editor.steps[1].config.text).toContain('artifact.body_2.text');
  });

  it('undo and redo restore spread and inline edits', () => {
    const cap = capsule();
    useCapsulesStore().addCapsule(cap);
    const editor = usePipelineEditorStore();
    editor.loadPipeline(pipeline([capsuleInstance(cap)]));

    editor.spreadCapsule('inst');
    editor.commitInlineCapsuleInnerStepEdit('inst', 'body', {label: 'Edited'}, 'Edit inline');
    let step = editor.steps[0]!;
    expect(step.config.type).toBe('capsule-instance');
    if (step.config.type !== 'capsule-instance') return;
    expect(step.config.inlineSteps?.[0]?.label).toBe('Edited');

    editor.undo();
    step = editor.steps[0]!;
    expect(step.config.type).toBe('capsule-instance');
    if (step.config.type !== 'capsule-instance') return;
    expect(step.config.inlineSteps?.[0]?.label).toBe('body');
    expect(step.config.inlineModified).toBe(false);

    editor.undo();
    step = editor.steps[0]!;
    expect(step.config.type).toBe('capsule-instance');
    if (step.config.type !== 'capsule-instance') return;
    expect(step.config.displayMode).toBeUndefined();
    expect(step.config.inlineSteps).toBeUndefined();

    editor.redo();
    step = editor.steps[0]!;
    expect(step.config.type).toBe('capsule-instance');
    if (step.config.type !== 'capsule-instance') return;
    expect(step.config.displayMode).toBe('inline');
    expect(step.config.inlineSteps?.[0]?.label).toBe('body');
  });

  it('undo restores a detached capsule instance', () => {
    const cap = capsule();
    useCapsulesStore().addCapsule(cap);
    const editor = usePipelineEditorStore();
    const instance = capsuleInstance(cap);
    instance.config = {
      ...instance.config,
      displayMode: 'inline',
      inlineSteps: [textStep('body', 'inline', 'body')],
    };
    editor.loadPipeline(pipeline([textStep('source', 'parent', 'body'), instance]));

    editor.detachCapsule('inst');
    expect(editor.steps.map((s) => s.id)).toEqual(['source', 'body']);

    editor.undo();
    expect(editor.steps.map((s) => s.id)).toEqual(['source', 'inst']);
    expect(editor.steps[1]?.config.type).toBe('capsule-instance');
  });

  it('locks the whole pipeline as a locked capsule when no range is selected', () => {
    const editor = usePipelineEditorStore();
    editor.loadPipeline(pipeline([textStep('a', 'A'), textStep('b', 'B')]));

    const result = editor.lockSelectionAsCapsule('Whole Pipeline', {capsuleId: 'cap-whole'});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.capsule.status).toBe('locked');
    expect(result.replacedStepCount).toBe(2);
    expect(editor.steps).toHaveLength(1);
    expect(editor.steps[0]?.config.type).toBe('capsule-instance');
  });

  it('lock inline keeps the just-locked working copy available for re-spread', () => {
    const cap = capsule();
    useCapsulesStore().addCapsule(cap);
    const editor = usePipelineEditorStore();
    const instance = capsuleInstance(cap);
    instance.config = {
      ...instance.config,
      displayMode: 'inline',
      inlineModified: true,
      inlineSteps: [textStep('body', 'inline', 'body')],
    };
    editor.loadPipeline(pipeline([instance]));

    const result = editor.lockInlineCapsuleAsCapsule('inst', 'Locked Inline', {capsuleId: 'cap-inline'});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const step = editor.steps[0]!;
    expect(step.config.type).toBe('capsule-instance');
    if (step.config.type !== 'capsule-instance') return;
    expect(step.config.displayMode).toBe('opaque');
    expect(step.config.inlineModified).toBe(false);
    expect(step.config.inlineSteps?.[0]?.config.type).toBe('presentation');
    expect(result.capsule.status).toBe('locked');
  });

  it('rejects locking inline capsules that contain unsupported nested steps', () => {
    const cap = capsule();
    useCapsulesStore().addCapsule(cap);
    const editor = usePipelineEditorStore();
    const instance = capsuleInstance(cap);
    instance.config = {
      ...instance.config,
      displayMode: 'inline',
      inlineSteps: [{
        id: 'loop',
        type: 'loop-group',
        label: 'Nested Loop',
        enabled: true,
        outputNamespace: 'loop',
        primaryOutputName: 'text',
        lastEditedAt: '2025-01-01T00:00:00.000Z',
        config: {
          type: 'loop-group',
          maxIterations: 2,
          exitCondition: {type: 'iterations'},
          steps: [textStep('body', 'inline', 'body')],
          outputNames: ['text'],
        },
      }],
    };
    editor.loadPipeline(pipeline([instance]));

    const result = editor.lockInlineCapsuleAsCapsule('inst', 'Nested Inline');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('loop-group');
  });

  it('reconciles corrupted inline model overrides back to capsule slot refs on load', () => {
    const domainStep: PipelineStep = {
      id: 'domain',
      type: 'model-call',
      label: 'domain',
      enabled: true,
      outputNamespace: 'domain',
      primaryOutputName: 'text',
      lastEditedAt: '2025-01-01T00:00:00.000Z',
      config: {
        type: 'model-call',
        modelRef: {kind: 'slot', slotName: 'domain_router'},
        mode: 'generate',
        outputNames: ['text', 'rawResponse'],
      },
    };
    const cap: CapsuleDefinition = {
      ...capsule(),
      id: 'cap-slots',
      interface: {
        inputs: [],
        outputs: [{name: 'result', kind: 'text', sourceArtifactKey: 'domain.text'}],
        parameters: [],
        modelSlots: [{name: 'domain_router', suggestedBuckets: ['general'], required: true}],
      },
      steps: [domainStep],
    };
    useCapsulesStore().addCapsule(cap);
    const corruptedInner: PipelineStep = {
      ...domainStep,
      config: {
        ...domainStep.config,
        modelRef: {kind: 'fixed', endpointId: 'ep1', modelName: 'deepseek-coder-v2:16b'},
      },
    };
    const instance: PipelineStep = {
      ...capsuleInstance(cap),
      config: {
        type: 'capsule-instance',
        capsuleId: cap.id,
        capsuleVersion: cap.version,
        inputBindings: {},
        outputBindings: {result: 'cap.text'},
        displayMode: 'inline',
        inlineModified: true,
        modelSlotBindings: {
          domain_router: {kind: 'fixed', endpointId: 'ep1', modelName: 'llama3.2:3b'},
        },
        inlineSteps: [corruptedInner],
        boundContentSignature: computeCapsuleContentSignature(cap),
      },
    };

    const editor = usePipelineEditorStore();
    editor.loadPipeline(pipeline([instance]));
    const loaded = editor.steps[0]!;
    expect(loaded.config.type).toBe('capsule-instance');
    if (loaded.config.type !== 'capsule-instance') return;
    const inner = loaded.config.inlineSteps?.[0];
    expect(inner?.config.type).toBe('model-call');
    if (inner?.config.type !== 'model-call') return;
    expect(inner.config.modelRef).toEqual({kind: 'slot', slotName: 'domain_router'});

    const reconciled = reconcileInlineCapsuleSlotRefs(cap, [corruptedInner]);
    expect(reconciled[0]?.config.type).toBe('model-call');
    if (reconciled[0]?.config.type !== 'model-call') return;
    expect(reconciled[0].config.modelRef).toEqual({kind: 'slot', slotName: 'domain_router'});
  });
});
