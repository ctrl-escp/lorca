import {expect, type Page} from '@playwright/test';

export const OLLAMA_BASE = 'http://localhost:11434';

export const GENERATOR_PLAN_UNRESOLVED = {
  schemaVersion: 1,
  steps: [{
    kind: 'custom',
    stepKey: 'summarize',
    label: 'Summarize',
    prompt: {mode: 'custom', text: 'Summarize the request.'},
    modelId: 'ep-local::nonexistent-model',
  }],
};

/** Multi-step plan (debate-shaped) for preview/apply smoke without a live LLM. */
export const GENERATOR_PLAN_DEBATE_SHORT = {
  schemaVersion: 1,
  steps: [
    {
      kind: 'custom',
      stepKey: 'hypothesis',
      label: 'Extract hypothesis',
      prompt: {mode: 'custom', text: 'Extract a hypothesis from the question.'},
      modelBucket: 'general',
    },
    {
      kind: 'custom',
      stepKey: 'expert_pro',
      label: 'Expert — support',
      prompt: {mode: 'custom', text: 'Argue for the hypothesis.'},
      historyReads: [{ref: 'generated:hypothesis.text', tagName: 'hypothesis'}],
      modelBucket: 'thinking',
    },
    {
      kind: 'presentation',
      stepKey: 'summary',
      label: 'Debate summary',
      text: 'Hypothesis: {{generated:hypothesis.text}}',
    },
  ],
};

export const GENERATOR_PLAN_RESOLVED = {
  schemaVersion: 1,
  steps: [{
    kind: 'custom',
    stepKey: 'summarize',
    label: 'Summarize',
    prompt: {mode: 'custom', text: 'Summarize the request.'},
    modelBucket: 'general',
  }],
};

export async function mockOllamaWithGeneratorPlan(page: Page, plan: object) {
  const planJson = JSON.stringify(plan);
  await page.route(`${OLLAMA_BASE}/api/tags`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        models: [{name: 'llama3:latest', modified_at: '', size: 0, digest: '', details: {}}],
      }),
    }),
  );
  await page.route(`${OLLAMA_BASE}/api/chat`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/x-ndjson',
      body: `${JSON.stringify({message: {role: 'assistant', content: planJson}, done: true})}\n`,
    }),
  );
  await page.route(`${OLLAMA_BASE}/api/generate`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/x-ndjson',
      body: `${JSON.stringify({response: planJson, done: true})}\n`,
    }),
  );
}

export async function expandLeftSection(
  page: Page,
  section: 'Endpoints' | 'Step library' | 'Capsules' | 'Models',
) {
  const toggle = page.locator('.section-toggle').filter({hasText: section}).first();
  await expect(toggle).toBeVisible({timeout: 10000});
  if (await toggle.getAttribute('aria-expanded') !== 'true') {
    await toggle.click();
  }
}

export async function addOllamaEndpoint(page: Page, name = 'Test Ollama') {
  await expandLeftSection(page, 'Endpoints');
  await page.getByTitle('Add a new AI endpoint').click();
  await page.getByPlaceholder('Local Ollama').fill(name);
  await page.getByPlaceholder('http://localhost:11434').fill(OLLAMA_BASE);
  await page.getByRole('button', {name: 'Add endpoint'}).click();
  await expect(page.getByText('llama3:latest')).toBeVisible({timeout: 10000});
}

export function generatorDialog(page: Page) {
  return page.getByRole('dialog', {name: 'Build from description'});
}

export function stepCard(page: Page, label: string) {
  return page.locator('.chain-step').filter({
    has: page.locator('.step-title').filter({hasText: new RegExp(`^${label}$`)}),
  }).first();
}

export function generatorDescriptionEditor(page: Page) {
  return generatorDialog(page).locator('.text-editor .cm-content').first();
}

export async function fillGeneratorDescription(page: Page, text: string) {
  const editor = generatorDescriptionEditor(page);
  await expect(editor).toBeVisible();
  await editor.fill(text);
}

export async function expectGeneratorDescription(page: Page, text: string) {
  const editor = generatorDescriptionEditor(page);
  await expect.poll(async () => {
    const trimmed = (await editor.innerText()).trim();
    if (text === '') {
      return trimmed === '' || trimmed === 'Describe the pipeline you want…';
    }
    return trimmed;
  }).toBe(text === '' ? true : text);
}

export async function openGeneratorModal(page: Page) {
  await page.getByRole('button', {name: '✨ Build from description…'}).click();
  await expect(generatorDialog(page)).toBeVisible();
}
