import {test, expect} from '@playwright/test';
import {expectUserPromptReady} from './helpers/promptEditor.js';

const OLLAMA_BASE = 'http://localhost:11434';

const GENERATOR_PLAN = {
  schemaVersion: 1,
  steps: [
    {
      kind: 'custom',
      stepKey: 'summarize',
      label: 'Summarize',
      prompt: {mode: 'custom', text: 'Summarize the request.'},
      modelId: 'ep::nonexistent-model',
    },
  ],
};

test.beforeEach(async ({page}) => {
  await page.goto('/');
  await page.evaluate(() =>
    new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('lorca');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    }),
  );

  const planJson = JSON.stringify(GENERATOR_PLAN);

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
      body: `${JSON.stringify({
        message: {role: 'assistant', content: planJson},
        done: true,
      })}\n`,
    }),
  );
  await page.route(`${OLLAMA_BASE}/api/generate`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/x-ndjson',
      body: `${JSON.stringify({response: planJson, done: true})}\n`,
    }),
  );

  await page.reload();
  await expectUserPromptReady(page);
});

async function expandLeftSection(
  page: import('@playwright/test').Page,
  section: 'Endpoints' | 'Step library' | 'Capsules' | 'Models',
) {
  const toggle = page.locator('.section-toggle').filter({hasText: section}).first();
  await expect(toggle).toBeVisible({timeout: 10000});
  if (await toggle.getAttribute('aria-expanded') !== 'true') {
    await toggle.click();
  }
}

async function addEndpoint(page: import('@playwright/test').Page) {
  await expandLeftSection(page, 'Endpoints');
  await page.getByTitle('Add a new AI endpoint').click();
  await page.getByPlaceholder('Local Ollama').fill('Test Ollama');
  await page.getByPlaceholder('http://localhost:11434').fill(OLLAMA_BASE);
  await page.getByRole('button', {name: 'Add endpoint'}).click();
  await expect(page.getByText('llama3:latest')).toBeVisible({timeout: 10000});
}

test('build from description shows preview and resolve models before apply', async ({page}) => {
  await addEndpoint(page);

  await page.getByRole('button', {name: '✨ Build from description…'}).click();
  const dialog = page.getByRole('dialog', {name: 'Build from description'});
  await expect(dialog).toBeVisible();

  await dialog.locator('textarea').first().fill('A one-step summarizer pipeline');
  await dialog.getByRole('button', {name: 'Generate'}).click();

  await expect(dialog.getByText('Summarize')).toBeVisible({timeout: 15000});

  const applyBtn = dialog.getByRole('button', {name: 'Apply'});
  const resolveBtn = dialog.getByRole('button', {name: 'Resolve models…'});
  await expect(applyBtn).toBeDisabled();
  await expect(resolveBtn).toBeEnabled();

  await dialog.getByRole('button', {name: 'Cancel'}).click();
  await page.getByRole('button', {name: '✨ Build from description…'}).click();
  await expect(dialog.getByText('Summarize')).toBeVisible();
  await expect(dialog.locator('textarea').first()).toHaveValue('A one-step summarizer pipeline');
});
