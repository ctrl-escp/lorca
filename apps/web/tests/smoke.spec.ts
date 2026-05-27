import {test, expect} from '@playwright/test';
import {
  expectUserPromptReady,
  expectUserPromptText,
  fillUserPrompt,
} from './helpers/promptEditor.js';

const OLLAMA_BASE = 'http://localhost:11434';

test.beforeEach(async ({page}) => {
  // Clear IndexedDB so each test starts fresh
  await page.goto('/');
  await page.evaluate(() =>
    new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('lorca');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    }),
  );

  // Mock Ollama responses (test-access + discovery share /api/tags)
  await page.route(`${OLLAMA_BASE}/api/tags`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        models: [{name: 'llama3:latest', modified_at: '', size: 0, digest: '', details: {}}],
      }),
    }),
  );
  await page.route(`${OLLAMA_BASE}/api/generate`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/x-ndjson',
      body: JSON.stringify({response: 'smoke test output', done: true}) + '\n',
    }),
  );
  await page.route(`${OLLAMA_BASE}/api/chat`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/x-ndjson',
      body: JSON.stringify({message: {role: 'assistant', content: 'smoke test output'}, done: true}) + '\n',
    }),
  );

  await page.reload();
  await expectUserPromptReady(page);
});

// Helper: add endpoint, auto-test access, and auto-discover models
async function addEndpoint(page: import('@playwright/test').Page, name = 'Test Ollama') {
  await expandLeftSection(page, 'Endpoints');
  await page.getByTitle('Add a new AI endpoint').click();
  await page.getByPlaceholder('Local Ollama').fill(name);
  await page.getByPlaceholder('http://localhost:11434').fill(OLLAMA_BASE);
  await page.getByRole('button', {name: 'Add endpoint'}).click();
  await expect(page.getByText('llama3:latest')).toBeVisible({timeout: 10000});
}

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

function endpointCard(page: import('@playwright/test').Page, name: string) {
  return page.locator('.ep-card').filter({
    has: page.locator('.ep-name', {hasText: name}),
  }).first();
}

function stepCard(page: import('@playwright/test').Page, label: string) {
  return page.locator('.chain-step').filter({
    has: page.locator('.step-title').filter({hasText: new RegExp(`^${label}$`)}),
  }).first();
}

async function insertBlankStepType(page: import('@playwright/test').Page, label: 'Model call' | 'Text' | 'Loop') {
  await expandLeftSection(page, 'Step library');
  const group = page.locator('.type-group').filter({
    has: page.locator('.type-group-name', {hasText: label}),
  }).first();
  await expect(group).toBeVisible();
  await group.getByRole('button', {name: '↓ Insert'}).click();
}

function capsuleRow(page: import('@playwright/test').Page, name: string) {
  return page.locator('.capsule-row').filter({
    has: page.locator('.capsule-row-name', {hasText: name}),
  }).first();
}

// 1. Add endpoint
test('smoke: add endpoint', async ({page}) => {
  await addEndpoint(page, 'My Endpoint');
  await expandLeftSection(page, 'Endpoints');
  await expect(endpointCard(page, 'My Endpoint')).toBeVisible();
});

// 2. Discover models
test('smoke: discover models', async ({page}) => {
  await addEndpoint(page);
  await expect(page.getByText('llama3:latest')).toBeVisible({timeout: 10000});
});

// 3. Enter target prompt
test('smoke: enter prompt', async ({page}) => {
  await fillUserPrompt(page, 'Hello world');
  await expectUserPromptText(page, 'Hello world');
});

// 4. Add wrapper step
test('smoke: add text step', async ({page}) => {
  const before = await page.locator('.chain-editor .chain-step').count();
  await insertBlankStepType(page, 'Text');
  await expect(page.locator('.chain-editor .chain-step')).toHaveCount(before + 1);
  await expect(page.locator('.chain-editor .step-type-badge').filter({hasText: 'Text'})).toBeVisible();
});

// 5. Add model-call step
test('smoke: add model-call step', async ({page}) => {
  const before = await page.locator('.chain-editor .chain-step').count();
  await insertBlankStepType(page, 'Model call');
  await expect(page.locator('.chain-editor .chain-step')).toHaveCount(before + 1);
});

// 6. Create capsule
test('smoke: create capsule', async ({page}) => {
  await page.getByTitle('Create a new empty Capsule').click();
  await expect(page.getByPlaceholder('Capsule name')).toBeVisible({timeout: 5000});
});

// 7. Lock capsule
test('smoke: lock capsule', async ({page}) => {
  await page.getByTitle('Create a new empty Capsule').click();
  await expect(page.getByPlaceholder('Capsule name')).toBeVisible({timeout: 5000});
  await page.getByPlaceholder('Capsule name').fill('Test Cap');
  await page.getByRole('button', {name: '+ Add Model Call'}).click();
  await page.getByRole('button', {name: 'Lock'}).click();
  await expect(capsuleRow(page, 'Test Cap').locator('.capsule-status.cs-locked')).toBeVisible();
});

// 8. Insert capsule into pipeline
test('smoke: insert capsule instance into pipeline', async ({page}) => {
  // Create and lock a capsule
  await page.getByTitle('Create a new empty Capsule').click();
  await expect(page.getByPlaceholder('Capsule name')).toBeVisible({timeout: 5000});
  await page.getByPlaceholder('Capsule name').fill('My Capsule');
  await page.getByRole('button', {name: '+ Add Model Call'}).click();
  await page.getByRole('button', {name: 'Lock'}).click();

  // Go back to pipeline
  await page.getByRole('button', {name: '← Pipeline'}).click();
  await expectUserPromptReady(page);

  await expandLeftSection(page, 'Capsules');
  await capsuleRow(page, 'My Capsule').getByRole('button', {name: '↓ Insert'}).click();
  await expect(page.locator('.step-type-badge').filter({hasText: 'Capsule'}).last()).toBeVisible();
});

test('smoke: spread and collapse inline capsule', async ({page}) => {
  await page.evaluate(async () => {
    const now = '2026-01-01T00:00:00.000Z';
    const capsule = {
      schemaVersion: 2,
      id: 'cap-inline-smoke',
      name: 'Inline Smoke Capsule',
      version: 'v1',
      status: 'locked',
      interface: {
        inputs: [],
        outputs: [{name: 'result', kind: 'text', sourceArtifactKey: 'body.text'}],
        parameters: [],
        modelSlots: [],
      },
      steps: [{
        id: 'body',
        type: 'presentation',
        label: 'Body Text',
        enabled: true,
        outputNamespace: 'body',
        primaryOutputName: 'text',
        lastEditedAt: now,
        config: {type: 'presentation', text: 'inline body', outputNames: ['text']},
      }],
      input: {raw: '', tagName: 'user_prompt', outputNamespace: 'user_prompt'},
      tests: [],
      createdAt: now,
      updatedAt: now,
    };
    const pipeline = {
      schemaVersion: 2,
      id: 'pipe-inline-smoke',
      name: 'Inline Smoke Pipeline',
      input: {raw: '', tagName: 'user_prompt', outputNamespace: 'user_prompt'},
      steps: [{
        id: 'inst',
        type: 'capsule-instance',
        label: 'Inline Smoke Capsule',
        enabled: true,
        outputNamespace: 'cap',
        primaryOutputName: 'text',
        lastEditedAt: now,
        config: {
          type: 'capsule-instance',
          capsuleId: capsule.id,
          capsuleVersion: capsule.version,
          inputBindings: {},
          outputBindings: {result: 'cap.text'},
          boundContentSignature: 'seeded',
        },
      }],
      createdAt: now,
      updatedAt: now,
    };
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('lorca');
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['pipelines', 'capsules'], 'readwrite');
      tx.objectStore('capsules').put(capsule);
      tx.objectStore('pipelines').put(pipeline);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    localStorage.setItem('lorca:activePipelineId', pipeline.id);
  });

  await page.reload();
  const card = stepCard(page, 'Inline Smoke Capsule');
  await expect(card).toBeVisible({timeout: 10000});
  await card.getByRole('button', {name: 'Edit inline'}).click();
  await expect(card.locator('.capsule-inline-body')).toBeVisible();
  await expect(card.locator('.capsule-inline-step-label')).toHaveText('Body Text');
  await card.getByRole('button', {name: 'Collapse'}).click();
  await expect(card.locator('.capsule-inline-body')).not.toBeVisible();
});

// 9. Configure loop-group max iterations
test('smoke: configure loop group step', async ({page}) => {
  await insertBlankStepType(page, 'Loop');
  await expect(page.locator('.chain-editor .step-type-badge').filter({hasText: 'Loop'})).toBeVisible();
  await page.locator('.chain-editor .chain-step').last().click();
  await page.getByRole('button', {name: 'Inspector'}).click();
  await page.getByRole('tab', {name: 'Config'}).click();
  const maxIter = page.getByTitle('Maximum iterations');
  await expect(maxIter).toBeVisible({timeout: 5000});
  await maxIter.fill('5');
  await maxIter.blur();
});

// 10 + 11. Execute pipeline and inspect trace
test('smoke: execute pipeline and inspect trace', async ({page}) => {
  await addEndpoint(page);
  await expect(page.getByText('llama3:latest')).toBeVisible({timeout: 5000});

  // Default pipeline includes a Model Call step — assign a discovered model
  await page.locator('.chain-editor .chain-step').filter({has: page.locator('.step-title', {hasText: 'Model Call'})}).first().click();
  await page.getByRole('button', {name: 'Inspector'}).click();
  await expect(page.locator('select:has(option:has-text("select model"))')).toBeVisible({timeout: 3000});
  const modelSelect = page.locator('select:has(option:has-text("select model"))');
  await modelSelect.selectOption({index: 1});
  await modelSelect.dispatchEvent('change');

  // Enter prompt and execute
  await fillUserPrompt(page, 'Say hello');
  await page.getByRole('button', {name: 'Execute Pipeline'}).click();

  // Wait for run to finish
  await expect(page.locator('.run-status.rs-completed')).toBeVisible({timeout: 15000});
  await expect(page.getByRole('button', {name: 'Execute Pipeline'})).toBeEnabled({timeout: 15000});

  // 11. Inspect trace
  await page.getByRole('button', {name: 'Trace'}).click();
  await expect(page.locator('.trace-event').first()).toBeVisible({timeout: 5000});
  await expect(page.locator('.ev-completed').first()).toBeVisible();

  // Check output
  await page.getByRole('button', {name: 'Output', exact: true}).click();
  await expect(page.locator('.output-panel')).toContainText('smoke test output', {timeout: 5000});
});

// Persistence: pipeline and capsule definitions survive reload.
test('smoke: save and reload pipeline and capsule', async ({page}) => {
  await page.getByPlaceholder('Pipeline name').fill('Persisted Pipeline');
  await page.getByPlaceholder('Pipeline name').blur();
  await expect(page.locator('.chain-editor .step-title').filter({hasText: 'Model Call'}).first()).toBeVisible();

  await page.getByTitle('Create a new empty Capsule').click();
  await expect(page.getByPlaceholder('Capsule name')).toBeVisible({timeout: 5000});
  await page.getByPlaceholder('Capsule name').fill('Persisted Capsule');
  await page.getByRole('button', {name: '← Pipeline'}).click();

  await page.reload();
  await expect(page.getByPlaceholder('Pipeline name')).toHaveValue('Persisted Pipeline', {timeout: 10000});
  await expect(page.locator('.step-title').filter({hasText: 'Model Call'})).toBeVisible();
  await expandLeftSection(page, 'Capsules');
  await expect(page.getByText('Persisted Capsule')).toBeVisible();
  await expect(capsuleRow(page, 'Persisted Capsule').locator('.capsule-status.cs-draft')).toBeVisible();
});

// Export and import Capsule.
test('smoke: export and import capsule', async ({page}) => {
  await page.getByTitle('Create a new empty Capsule').click();
  await expect(page.getByPlaceholder('Capsule name')).toBeVisible({timeout: 5000});
  await page.getByPlaceholder('Capsule name').fill('Portable Cap');
  await page.getByRole('button', {name: '+ Add Model Call'}).click();
  await page.getByPlaceholder('Capsule name').blur();
  await expect(capsuleRow(page, 'Portable Cap')).toBeVisible();
  await expect(capsuleRow(page, 'Portable Cap').locator('.capsule-status.cs-draft')).toBeVisible();

  const exportText = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('lorca');
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
    });
    const capsules = await new Promise<Array<{name: string; version: string; status: string}>>((resolve, reject) => {
      const tx = db.transaction('capsules', 'readonly');
      const req = tx.objectStore('capsules').getAll();
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result as Array<{name: string; version: string; status: string}>);
    });
    const capsule = capsules.find((c) => c.name === 'Portable Cap');
    if (!capsule) throw new Error('exported capsule not found in IndexedDB');
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      app: 'lorca',
      kind: 'capsule',
      capsule,
    });
  });
  const exported = JSON.parse(exportText) as {kind: string; capsule: {name: string}};
  expect(exported.kind).toBe('capsule');
  expect(exported.capsule.name).toBe('Portable Cap');

  await page.locator('.capsule-toolbar').getByRole('button', {name: 'Export'}).click();

  await page.evaluate(() =>
    new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('lorca');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    }),
  );
  await page.reload();
  await expandLeftSection(page, 'Capsules');
  await expect(capsuleRow(page, 'Portable Cap')).toHaveCount(0);

  const importChooser = page.waitForEvent('filechooser');
  await page.getByTitle('Import a Capsule from a JSON file').click();
  const chooser = await importChooser;
  await chooser.setFiles({
    name: 'portable.capsule.json',
    mimeType: 'application/json',
    buffer: Buffer.from(exportText),
  });

  await expect(page.getByRole('dialog')).toBeVisible({timeout: 5000});
  await page.getByRole('dialog').getByRole('button', {name: 'Import'}).click();
  await expect(page.locator('.capsule-row-name').filter({hasText: 'Portable Cap'})).toBeVisible({timeout: 5000});
  await expect(page.locator('.capsule-row-meta').filter({hasText: 'draft'})).toBeVisible();
});

test('smoke: insert intent extraction suggestion', async ({page}) => {
  await expandLeftSection(page, 'Step library');
  await expect(page.getByText('Intent Extraction')).toBeVisible({timeout: 5000});
  const row = page.locator('.suggestion-row').filter({hasText: 'Intent Extraction'});
  await row.getByRole('button', {name: '↓ After'}).click();
  await expect(page.locator('.step-title').filter({hasText: 'Intent Extraction'})).toBeVisible();
});

test('smoke: reject invalid capsule import', async ({page}) => {
  const importChooser = page.waitForEvent('filechooser');
  await page.getByTitle('Import a Capsule from a JSON file').click();
  const chooser = await importChooser;
  await chooser.setFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"kind":"capsule","app":"lorca","capsule":{}}'),
  });
  await expect(page.getByText('Import failed')).toBeVisible({timeout: 5000});
});
