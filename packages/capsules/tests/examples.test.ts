// @vitest-environment node
import {describe, it, expect} from 'vitest';
import type {CapsuleDefinition, PipelineStep} from '@lorca/core';
import {renderTemplate} from '@lorca/prompt';
import {
  BUILTIN_EXAMPLES,
  BUILTIN_EXAMPLE_IDS,
  collectExampleTemplateStrings,
  duplicateExampleCapsule,
  getBuiltinExample,
  isBuiltinExampleId,
  LORCA_PIPELINE_GENERATOR_ID,
} from '../src/examples/index.js';
import {validateCapsule} from '../src/validate.js';

const SAMPLE_ARTIFACTS: Record<string, unknown> = {
  'user_prompt.raw': 'Build a todo app with offline sync',
  'user_prompt.xml': '<user_prompt>\nBuild a todo app with offline sync\n</user_prompt>',
  'description.text': 'Build a pipeline that extracts intent and answers the request',
  acceptance_criteria: {criteria: ['Supports add', 'Works offline'], assumptions: []},
  candidate_answer: 'The app stores todos locally and syncs when online.',
  'intent.json': {
    intent: 'Build a todo app',
    domain: 'software planning',
    acceptance_criteria: ['Supports add', 'Works offline'],
    constraints: ['Use local storage'],
    quality_bar: ['Concrete architecture'],
    ambiguities: [],
  },
  'candidate_a.text': 'Use IndexedDB and a service worker to keep todos offline.',
  'candidate_b.text': 'Use localStorage and sync periodically when a connection returns.',
  'domain.json': {
    domain: 'software engineering',
    expert_role: 'senior frontend engineer',
    knowledge_needed: ['offline-first apps'],
    risk_flags: [],
  },
  'plan.json': {
    intent: 'Advise on an offline todo app',
    acceptance_criteria: ['Explains storage', 'Explains sync'],
    constraints: ['Be concise'],
    must_cover: ['offline behavior'],
    answer_style: 'practical',
  },
  'answer.text': 'Use IndexedDB for durable local state and a queued sync worker for remote updates.',
  source_text: 'Long paragraph about project history and goals that should be shortened.',
  baseline_text: 'The service returns 200 for healthy checks.',
  current_text: 'The service returns 503 for healthy checks.',
};

const SAMPLE_PARAMS: Record<string, unknown> = {
  style: 'concise',
};

describe('builtin examples', () => {
  it('defines the built-in Capsule library', () => {
    expect(BUILTIN_EXAMPLE_IDS).toHaveLength(11);
    expect(BUILTIN_EXAMPLE_IDS).toEqual([
      'lorca-pipeline-generator',
      'example-intent-extraction',
      'example-acceptance-criteria',
      'example-candidate-answer',
      'example-answer-verification',
      'example-summary',
      'example-prompt-rewrite',
      'example-constraint-extraction',
      'example-drift-check',
      'example-best-of-two',
      'example-expert',
    ]);
  });

  it('marks example ids and resolves definitions', () => {
    for (const id of BUILTIN_EXAMPLE_IDS) {
      expect(isBuiltinExampleId(id)).toBe(true);
      expect(getBuiltinExample(id)?.status).toBe('locked');
    }
    expect(isBuiltinExampleId('cap-user')).toBe(false);
  });

  it('validates every built-in example', () => {
    for (const def of BUILTIN_EXAMPLES) {
      const result = validateCapsule(def);
      expect(result.ok, `${def.id} should validate`).toBe(true);
    }
  });

  it('exports built-in examples as step-chain capsules only', () => {
    for (const def of BUILTIN_EXAMPLES) {
      expect(def.steps.length, `${def.id} should define steps`).toBeGreaterThan(0);
      expect(def.schemaVersion, `${def.id} should use schemaVersion 2`).toBe(2);
    }
  });

  it('wraps The Expert answer and verify steps in a retry loop', () => {
    const expert = getBuiltinExample('example-expert')!;
    const retryLoop = expert.steps?.find((s) => s.id === 'answer_verify_retry');
    expect(retryLoop?.config.type).toBe('loop-group');
    if (retryLoop?.config.type !== 'loop-group') return;
    expect(retryLoop.config.maxIterations).toBe(3);
    expect(retryLoop.config.exitCondition).toEqual({type: 'json-field-equals', fieldPath: 'passed', value: true});
    expect(retryLoop.config.steps.map((s) => s.id)).toEqual(['answer', 'verify']);
    const answer = retryLoop.config.steps[0];
    expect(answer?.prompt?.historyReads.some((r) => r.sourceArtifactRef === 'loop.prev.text')).toBe(true);
  });

  it('defines executable step-chain prompts for every built-in example', () => {
    function assertStepPrompts(def: CapsuleDefinition, steps: PipelineStep[]) {
      for (const step of steps) {
        if (step.config.type === 'loop-group') {
          assertStepPrompts(def, step.config.steps);
          continue;
        }
        expect(step.type, `${def.id}:${step.id} should not expose legacy prompt text as a separate step`).toBe('model-call');
        if (step.config.type === 'model-call') {
          expect(step.prompt?.blocks.length || step.prompt?.previousOutput.enabled, `${def.id}:${step.id} should have a prompt`).toBeTruthy();
        }
      }
    }

    for (const def of BUILTIN_EXAMPLES) {
      expect(def.steps?.length, `${def.id} should define canonical steps`).toBeGreaterThan(0);
      assertStepPrompts(def, def.steps ?? []);
    }
  });

  it('renders built-in step-chain prompt blocks', () => {
    for (const def of BUILTIN_EXAMPLES) {
      for (const step of def.steps ?? []) {
        for (const block of step.prompt?.blocks ?? []) {
          const rendered = renderTemplate(block.body, {
            artifacts: SAMPLE_ARTIFACTS,
            params: SAMPLE_PARAMS,
            allowParams: true,
          });
          expect(rendered.ok, `${def.id}:${step.id} prompt block render failed`).toBe(true);
        }
      }
    }
  });

  it('renders example template prompts (snapshots)', () => {
    for (const def of BUILTIN_EXAMPLES) {
      const templates = collectExampleTemplateStrings(def);
      if (def.id === LORCA_PIPELINE_GENERATOR_ID) {
        expect(templates).toHaveLength(0);
        continue;
      }
      expect(templates.length, `${def.id} should have at least one template`).toBeGreaterThan(0);
      for (const template of templates) {
        const rendered = renderTemplate(template, {
          artifacts: SAMPLE_ARTIFACTS,
          params: SAMPLE_PARAMS,
          allowParams: true,
        });
        expect(rendered.ok, `${def.id} template render failed`).toBe(true);
        if (rendered.ok) {
          expect(rendered.value).toMatchSnapshot(`${def.id}`);
        }
      }
    }
  });

  it('duplicateExampleCapsule creates an editable draft copy', () => {
    const source = getBuiltinExample('example-intent-extraction')!;
    const copy = duplicateExampleCapsule(source, 'cap-copy-1');
    expect(copy.id).toBe('cap-copy-1');
    expect(copy.status).toBe('draft');
    expect(copy.version).toBe('v1');
    expect(copy.lockedAt).toBeUndefined();
    expect(copy.name).toContain('(copy)');
    expect(validateCapsule(copy).ok).toBe(true);
  });
});
