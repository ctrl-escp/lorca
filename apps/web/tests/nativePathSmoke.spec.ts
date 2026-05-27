import {test, expect} from '@playwright/test';
import {importPipelineJson} from './helpers/pipelineToolbar.js';

const OLLAMA_BASE = 'http://localhost:11434';

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

  await page.route(`${OLLAMA_BASE}/api/tags`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        models: [{name: 'llama3:latest', modified_at: '', size: 0, digest: '', details: {}}],
      }),
    }),
  );

  await page.reload();
  await expect(page.getByPlaceholder('Pipeline name')).toBeVisible({timeout: 10000});
});

async function addEndpoint(page: import('@playwright/test').Page) {
  const toggle = page.locator('.section-toggle').filter({hasText: 'Endpoints'});
  if (await toggle.getAttribute('aria-expanded') !== 'true') {
    await toggle.click();
  }
  await page.getByTitle('Add a new AI endpoint').click();
  await page.getByPlaceholder('Local Ollama').fill('Test Ollama');
  await page.getByPlaceholder('http://localhost:11434').fill(OLLAMA_BASE);
  await page.getByRole('button', {name: 'Add endpoint'}).click();
  await expect(page.getByText('llama3:latest')).toBeVisible({timeout: 10000});
}

test('e2e: import remaps missing model references onto local endpoints', async ({page}) => {
  await addEndpoint(page);

  const exportPayload = JSON.stringify({
    exportedAt: '2026-01-01T00:00:00.000Z',
    app: 'lorca',
    kind: 'pipeline',
    pipeline: {
      schemaVersion: 2,
      id: 'pipe-remap-e2e',
      name: 'Remap Smoke Pipeline',
      input: {raw: '', tagName: 'user', outputNamespace: 'user_prompt'},
      steps: [{
        id: 'step-main',
        type: 'model-call',
        label: 'Remap Model',
        enabled: true,
        outputNamespace: 'answer',
        primaryOutputName: 'text',
        lastEditedAt: '2026-01-01T00:00:00.000Z',
        config: {
          type: 'model-call',
          modelRef: {kind: 'fixed', endpointId: 'ep-old', modelName: 'llama3:latest'},
          mode: 'generate',
          outputNames: ['text', 'rawResponse'],
        },
      }],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  });

  await importPipelineJson(page, exportPayload);

  await expect(page.getByRole('button', {name: 'Remap Smoke Pipeline ›'})).toBeVisible({timeout: 10000});
  await expect(page.locator('.step-title').filter({hasText: 'Remap Model'})).toBeVisible();

  const storedModelRef = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('lorca');
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
    });
    const pipelines = await new Promise<Array<{name: string; steps: Array<{config: {type: string; modelRef?: unknown}}>}>>((
      resolve,
      reject,
    ) => {
      const tx = db.transaction('pipelines', 'readonly');
      const req = tx.objectStore('pipelines').getAll();
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result as Array<{name: string; steps: Array<{config: {type: string; modelRef?: unknown}}>}>);
    });
    const pipeline = pipelines.find((p) => p.name === 'Remap Smoke Pipeline');
    if (!pipeline) throw new Error('imported pipeline not found');
    const step = pipeline.steps[0];
    if (step?.config.type !== 'model-call') throw new Error('expected model-call step');
    return step.config.modelRef;
  });

  expect(storedModelRef).toMatchObject({
    kind: 'fixed',
    modelName: 'llama3:latest',
  });
  expect(storedModelRef).not.toMatchObject({endpointId: 'ep-old'});
});
