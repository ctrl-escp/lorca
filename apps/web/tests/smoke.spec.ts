import {test, expect} from '@playwright/test';

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
  await expect(page.getByPlaceholder('Enter your target prompt…')).toBeVisible({timeout: 10000});
});

// Helper: add endpoint and make it available
async function addEndpoint(page: import('@playwright/test').Page, name = 'Test Ollama') {
  await page.getByTitle('Add a new AI endpoint (e.g. local Ollama)').click();
  await page.getByPlaceholder('Local Ollama').fill(name);
  await page.getByPlaceholder('http://localhost:11434').fill(OLLAMA_BASE);
  await page.getByRole('button', {name: 'Add endpoint'}).click();
  await expect(page.getByText(name)).toBeVisible();
  // Test access so browserAccess becomes 'available' (enables Discover models)
  await page.getByRole('button', {name: 'Test access'}).click();
  await expect(page.getByRole('button', {name: 'Discover models'})).toBeEnabled({timeout: 5000});
}

async function expandLeftSection(
  page: import('@playwright/test').Page,
  section: 'Endpoints' | 'Examples' | 'Capsules' | 'Models',
) {
  const toggle = page.locator('.section-toggle').filter({hasText: section});
  if (await toggle.getAttribute('aria-expanded') !== 'true') {
    await toggle.click();
  }
}

// 1. Add endpoint
test('smoke: add endpoint', async ({page}) => {
  await page.getByTitle('Add a new AI endpoint (e.g. local Ollama)').click();
  await page.getByPlaceholder('Local Ollama').fill('My Endpoint');
  await page.getByPlaceholder('http://localhost:11434').fill(OLLAMA_BASE);
  await page.getByRole('button', {name: 'Add endpoint'}).click();
  await expect(page.getByText('My Endpoint')).toBeVisible();
});

// 2. Discover models
test('smoke: discover models', async ({page}) => {
  await addEndpoint(page);
  await page.getByRole('button', {name: 'Discover models'}).click();
  await expect(page.getByText('llama3:latest')).toBeVisible({timeout: 5000});
});

// 3. Enter target prompt
test('smoke: enter prompt', async ({page}) => {
  await page.getByPlaceholder('Enter your target prompt…').fill('Hello world');
  await expect(page.getByPlaceholder('Enter your target prompt…')).toHaveValue('Hello world');
});

// 4. Add wrapper step
test('smoke: add prompt wrapper step', async ({page}) => {
  await page.getByRole('button', {name: '+ Prompt wrapper'}).click();
  await expect(page.locator('.step-type-badge').filter({hasText: 'Wrapper'})).toBeVisible();
});

// 5. Add model-call step
test('smoke: add model-call step', async ({page}) => {
  await page.getByRole('button', {name: '+ Model call'}).click();
  await expect(page.locator('.step-type-badge').filter({hasText: 'Model call'})).toBeVisible();
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
  await page.getByRole('button', {name: 'Lock'}).click();
  await expect(page.getByText('locked')).toBeVisible();
});

// 8. Insert capsule into pipeline
test('smoke: insert capsule instance into pipeline', async ({page}) => {
  // Create and lock a capsule
  await page.getByTitle('Create a new empty Capsule').click();
  await expect(page.getByPlaceholder('Capsule name')).toBeVisible({timeout: 5000});
  await page.getByPlaceholder('Capsule name').fill('My Capsule');
  await page.getByRole('button', {name: 'Lock'}).click();

  // Go back to pipeline
  await page.getByRole('button', {name: '← Pipeline'}).click();
  await expect(page.getByPlaceholder('Enter your target prompt…')).toBeVisible();

  // Add capsule instance
  await page.getByRole('button', {name: '+ Capsule'}).click();
  await expect(page.getByText('Capsule').nth(1)).toBeVisible(); // "Capsule" badge on the new node
});

// 9. Configure capsule loop count
test('smoke: configure capsule loop count', async ({page}) => {
  // Create, lock, insert capsule
  await page.getByTitle('Create a new empty Capsule').click();
  await expect(page.getByPlaceholder('Capsule name')).toBeVisible({timeout: 5000});
  await page.getByPlaceholder('Capsule name').fill('Loopy Cap');
  await page.getByRole('button', {name: 'Lock'}).click();
  await page.getByRole('button', {name: '← Pipeline'}).click();
  await page.getByRole('button', {name: '+ Capsule'}).click();

  // Click the capsule node to select it (triggers inspector)
  await page.locator('.chain-step').last().click();

  // Select the capsule definition — loop config only appears after selection
  await expect(page.locator('select:has(option:has-text("select locked capsule"))')).toBeVisible({timeout: 3000});
  await page.locator('select:has(option:has-text("select locked capsule"))').selectOption({index: 1});

  // Enable loop in the CapsuleInstanceInspector
  await expect(page.locator('label').filter({hasText: 'Enable loop'})).toBeVisible({timeout: 3000});
  await page.locator('label').filter({hasText: 'Enable loop'}).locator('input[type="checkbox"]').check();
  await expect(page.locator('label').filter({hasText: 'Iterations'})).toBeVisible();
  await page.locator('input[type="number"]').first().fill('3');
});

// 10 + 11. Execute pipeline and inspect trace
test('smoke: execute pipeline and inspect trace', async ({page}) => {
  // Add endpoint + discover models
  await addEndpoint(page);
  await page.getByRole('button', {name: 'Discover models'}).click();
  await expect(page.getByText('llama3:latest')).toBeVisible({timeout: 5000});

  // Add model-call node
  await page.getByRole('button', {name: '+ Model call'}).click();

  // Select the model-call node in inspector
  await page.locator('.chain-step').last().click();
  // Select first real model option (index 1; index 0 is the placeholder)
  await expect(page.locator('select:has(option:has-text("select model"))')).toBeVisible({timeout: 3000});
  await page.locator('select:has(option:has-text("select model"))').selectOption({index: 1});

  // Enter prompt and execute
  await page.getByPlaceholder('Enter your target prompt…').fill('Say hello');
  await page.getByRole('button', {name: 'Execute'}).click();

  // Wait for run to finish (Execute button re-enables)
  await expect(page.getByRole('button', {name: 'Execute'})).toBeEnabled({timeout: 15000});

  // 11. Inspect trace
  await page.getByRole('button', {name: 'Trace'}).click();
  await expect(page.locator('.trace-event').first()).toBeVisible({timeout: 5000});
  await expect(page.locator('.ev-completed').first()).toBeVisible();

  // Check output
  await page.getByRole('button', {name: 'Output'}).click();
  await expect(page.getByText('smoke test output')).toBeVisible({timeout: 5000});
});

// Persistence: pipeline and capsule definitions survive reload (Phase 11 deliverable 8–9)
test('smoke: save and reload pipeline and capsule', async ({page}) => {
  await page.getByPlaceholder('Pipeline name').fill('Persisted Pipeline');
  await page.getByPlaceholder('Pipeline name').blur();
  await page.getByRole('button', {name: '+ Model call'}).click();
  await expect(page.locator('.step-type-badge').filter({hasText: 'Model call'})).toBeVisible();

  await page.getByTitle('Create a new empty Capsule').click();
  await expect(page.getByPlaceholder('Capsule name')).toBeVisible({timeout: 5000});
  await page.getByPlaceholder('Capsule name').fill('Persisted Capsule');
  await page.getByRole('button', {name: 'Lock'}).click();
  await page.getByRole('button', {name: '← Pipeline'}).click();

  await page.reload();
  await expect(page.getByPlaceholder('Pipeline name')).toHaveValue('Persisted Pipeline', {timeout: 10000});
  await expect(page.locator('.step-type-badge').filter({hasText: 'Model call'})).toBeVisible();
  await expandLeftSection(page, 'Capsules');
  await expect(page.getByText('Persisted Capsule')).toBeVisible();
  await expect(page.getByText('locked')).toBeVisible();
});

// Phase 12: export and import Capsule
test('smoke: export and import capsule', async ({page}) => {
  await page.getByTitle('Create a new empty Capsule').click();
  await expect(page.getByPlaceholder('Capsule name')).toBeVisible({timeout: 5000});
  await page.getByPlaceholder('Capsule name').fill('Portable Cap');
  await page.getByRole('button', {name: 'Lock'}).click();
  await expect(page.getByText('locked')).toBeVisible();

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
  await expect(page.getByText('No Capsules yet.')).toBeVisible({timeout: 10000});

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
  await expect(page.locator('.capsule-row-meta').filter({hasText: 'locked'})).toBeVisible();
});

test('smoke: duplicate example capsule', async ({page}) => {
  await expandLeftSection(page, 'Examples');
  await expect(page.getByText('Intent Extraction')).toBeVisible({timeout: 5000});
  const row = page.locator('.example-row').filter({hasText: 'Intent Extraction'});
  await row.getByRole('button', {name: 'Duplicate'}).click();
  await expect(page.getByPlaceholder('Capsule name')).toHaveValue('Intent Extraction (copy)', {timeout: 5000});
  await expect(page.locator('.capsule-status.status-draft')).toBeVisible();
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
