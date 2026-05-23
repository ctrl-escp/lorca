// @vitest-environment node
import {describe, it, expect} from 'vitest';
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
  acceptance_criteria: {criteria: ['Supports add', 'Works offline'], assumptions: []},
  candidate_answer: 'The app stores todos locally and syncs when online.',
  source_text: 'Long paragraph about project history and goals that should be shortened.',
  baseline_text: 'The service returns 200 for healthy checks.',
  current_text: 'The service returns 503 for healthy checks.',
};

const SAMPLE_PARAMS: Record<string, unknown> = {
  style: 'concise',
};

describe('builtin examples', () => {
  it('defines the built-in Capsule library', () => {
    expect(BUILTIN_EXAMPLE_IDS).toHaveLength(9);
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
