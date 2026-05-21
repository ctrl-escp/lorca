import {test, expect} from '@playwright/test';

const OLLAMA_BASE = 'http://localhost:11434';
let generateCallCount = 0;

test.beforeEach(async ({page}) => {
  generateCallCount = 0;
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
  await page.route(`${OLLAMA_BASE}/api/generate`, (route) => {
    generateCallCount += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/x-ndjson',
      body: JSON.stringify({response: `model output #${generateCallCount}`, done: true}) + '\n',
    });
  });
  await page.route(`${OLLAMA_BASE}/api/chat`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/x-ndjson',
      body: JSON.stringify({message: {role: 'assistant', content: 'chat output'}, done: true}) + '\n',
    }),
  );

  await page.reload();
  await expect(page.getByPlaceholder('Enter your prompt…')).toBeVisible({timeout: 10000});
});

async function expandLeftSection(
  page: import('@playwright/test').Page,
  section: 'Endpoints' | 'Step Suggestions' | 'Capsules',
) {
  const toggle = page.locator('.section-toggle').filter({hasText: section});
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
  await page.getByRole('button', {name: 'Test access'}).click();
  await expect(page.getByRole('button', {name: 'Discover models'})).toBeEnabled({timeout: 5000});
  await page.getByRole('button', {name: 'Discover models'}).click();
  await expect(page.getByText('llama3:latest')).toBeVisible({timeout: 5000});
}

function stepCard(page: import('@playwright/test').Page, label: string) {
  return page.locator('.chain-step').filter({
    has: page.locator('.step-title', {hasText: label}),
  }).first();
}

async function selectStep(page: import('@playwright/test').Page, label: string) {
  await stepCard(page, label).click();
}

async function insertSuggestionBefore(
  page: import('@playwright/test').Page,
  suggestionName: string,
) {
  await expandLeftSection(page, 'Step Suggestions');
  const row = page.locator('.suggestion-row').filter({hasText: suggestionName});
  await row.getByRole('button', {name: '↑ Before'}).click();
}

async function openInspector(page: import('@playwright/test').Page) {
  await page.getByRole('button', {name: 'Inspector'}).click();
}

async function openPromptTab(page: import('@playwright/test').Page) {
  await openInspector(page);
  await page.getByRole('tab', {name: 'Prompt'}).click();
}

test('happy path: suggestions, partial run, stale, disable, undo, capsule', async ({page}) => {
  test.setTimeout(120_000);
  let nextCapsulePromptName = 'Happy Path Capsule';
  page.on('dialog', async (dialog) => {
    const msg = dialog.message();
    if (dialog.type() === 'prompt') {
      if (msg.includes('Capsule name')) {
        await dialog.accept(nextCapsulePromptName);
      } else {
        await dialog.accept('default');
      }
    } else {
      await dialog.accept();
    }
  });

  await addEndpoint(page);

  // Default pipeline already includes one main model call
  await selectStep(page, 'Model Call');
  await expect(page.locator('select:has(option:has-text("select model"))')).toBeVisible({timeout: 3000});
  await page.locator('select:has(option:has-text("select model"))').selectOption({index: 1});

  // Insert Intent Extraction and Acceptance Criteria before main model call
  await insertSuggestionBefore(page, 'Intent Extraction');
  await selectStep(page, 'Model Call');
  await insertSuggestionBefore(page, 'Acceptance Criteria');

  await expect(stepCard(page, 'Intent Extraction')).toBeVisible();
  await expect(stepCard(page, 'Acceptance Criteria')).toBeVisible();
  await expect(stepCard(page, 'Model Call')).toBeVisible();

  await page.getByPlaceholder('Enter your prompt…').fill('Build a todo app with auth');

  // Run up to Acceptance Criteria — main model must not run
  await selectStep(page, 'Acceptance Criteria');
  await stepCard(page, 'Acceptance Criteria').getByRole('button', {name: 'Run up to here'}).click();
  await expect(page.getByRole('button', {name: 'Execute Pipeline'})).toBeEnabled({timeout: 15000});

  const callsAfterPartial = generateCallCount;
  expect(callsAfterPartial).toBe(2);

  // Configure history reads on main model
  await selectStep(page, 'Model Call');
  await openPromptTab(page);
  await page.getByRole('button', {name: '+ Read'}).click();
  await page.getByRole('button', {name: '+ Read'}).click();

  const historyReads = page.locator('.pce-history-read');
  await historyReads.nth(0).locator('select').first().selectOption({label: 'Intent Extraction'});
  await historyReads.nth(1).locator('select').first().selectOption({label: 'Acceptance Criteria'});
  await expect(stepCard(page, 'Model Call').locator('.step-history-badge')).toHaveText(/↩ 2/);

  // Previous output placement: before vs after own prompt blocks (XML preview order)
  await openPromptTab(page);
  const prevPlacement = page.locator('.pce-select').filter({has: page.locator('option[value="beforeOwnPrompt"]')});
  await page.locator('.pce-section').filter({hasText: 'Previous Output'}).getByRole('checkbox').check();
  await prevPlacement.selectOption('beforeOwnPrompt');
  const previewToggle = page.locator('.pce-section').filter({hasText: 'XML Preview'}).getByRole('button');
  await previewToggle.click();
  const previewBefore = page.locator('.pce-preview');
  await expect(previewBefore).toBeVisible();
  const xmlBefore = await previewBefore.textContent() ?? '';
  expect(xmlBefore).toContain('model output #1');
  expect(xmlBefore).toContain('model output #2');
  expect(xmlBefore).not.toContain('…');
  const closePrev = xmlBefore.indexOf('</previous_output>');
  const tagAfterPrev = xmlBefore.indexOf('<', closePrev + 1);
  expect(closePrev).toBeGreaterThanOrEqual(0);
  expect(tagAfterPrev).toBeGreaterThan(closePrev);

  await prevPlacement.selectOption('afterOwnPrompt');
  await expect(previewBefore).toBeVisible();
  const xmlAfter = await previewBefore.textContent() ?? '';
  const openPrev = xmlAfter.indexOf('<previous_output>');
  const closePrevAfter = xmlAfter.lastIndexOf('</previous_output>');
  expect(openPrev).toBeGreaterThanOrEqual(0);
  expect(closePrevAfter).toBeGreaterThan(xmlAfter.lastIndexOf('</', closePrevAfter - 1));

  // Edit intent prompt → downstream stale
  await selectStep(page, 'Intent Extraction');
  await openPromptTab(page);
  const intentBody = page.locator('.pce-body').first();
  await intentBody.fill('Extract intent with extra detail.\nRespond with JSON only.');
  await intentBody.blur();

  // Acceptance Criteria ran in the partial run and is downstream of Intent
  await expect(stepCard(page, 'Acceptance Criteria').locator('.run-stale')).toHaveText(/stale/i, {timeout: 5000});

  // Disable acceptance criteria → main model blocked
  await selectStep(page, 'Acceptance Criteria');
  await stepCard(page, 'Acceptance Criteria').getByTitle('Disable step').click();
  await expect(stepCard(page, 'Acceptance Criteria').locator('.step-disabled-badge')).toBeVisible();
  await expect(stepCard(page, 'Model Call').locator('.run-blocked')).toHaveText(/blocked/i, {timeout: 5000});

  // Undo disable
  await page.getByRole('button', {name: '↩ Undo'}).click();
  await expect(stepCard(page, 'Acceptance Criteria').locator('.step-disabled-badge')).not.toBeVisible();
  await expect(stepCard(page, 'Model Call').locator('.run-blocked')).not.toBeVisible();

  // Run full pipeline
  await page.getByRole('button', {name: 'Execute Pipeline'}).click();
  await expect(page.getByRole('button', {name: 'Execute Pipeline'})).toBeEnabled({timeout: 15000});
  const callsAfterFull = generateCallCount;
  expect(callsAfterFull - callsAfterPartial).toBe(3);

  await page.getByRole('button', {name: 'Output'}).click();
  await expect(page.locator('.output-text')).toContainText(`model output #${callsAfterFull}`, {timeout: 5000});

  // Extract Intent + Acceptance Criteria into a mid-pipeline Capsule
  nextCapsulePromptName = 'Mid Steps Capsule';
  await selectStep(page, 'Intent Extraction');
  await stepCard(page, 'Acceptance Criteria').click({modifiers: ['Shift']});
  await page.getByRole('button', {name: 'Extract to Capsule'}).click();
  await expect(page.getByRole('button', {name: '← Pipeline'})).toBeVisible({timeout: 5000});
  await page.getByRole('button', {name: '← Pipeline'}).click();
  await expect(stepCard(page, 'Mid Steps Capsule')).toBeVisible();
  await expect(stepCard(page, 'Intent Extraction')).not.toBeVisible();
  await expect(stepCard(page, 'Model Call')).toBeVisible();

  // Export pipeline JSON and round-trip via import
  await page.getByPlaceholder('Pipeline name').fill('Roundtrip Pipeline');
  await page.getByPlaceholder('Pipeline name').blur();
  const exportPayload = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('lorca');
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
    });
    const pipelines = await new Promise<Array<{name: string; steps: Array<{label: string}>}>>((
      resolve,
      reject,
    ) => {
      const tx = db.transaction('pipelines', 'readonly');
      const req = tx.objectStore('pipelines').getAll();
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result as Array<{name: string; steps: Array<{label: string}>}>);
    });
    const capsules = await new Promise<Array<{id: string; name: string}>>((
      resolve,
      reject,
    ) => {
      const tx = db.transaction('capsules', 'readonly');
      const req = tx.objectStore('capsules').getAll();
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result as Array<{id: string; name: string}>);
    });
    const p = pipelines.find((x) => x.name === 'Roundtrip Pipeline');
    if (!p) throw new Error('pipeline not found');
    const included = capsules.filter((c) => c.name === 'Mid Steps Capsule');
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      app: 'lorca',
      kind: 'pipeline',
      pipeline: p,
      includedCapsules: included,
    });
  });

  await page.evaluate(() =>
    new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('lorca');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    }),
  );
  await page.reload();
  await expect(page.getByPlaceholder('Enter your prompt…')).toBeVisible({timeout: 10000});
  await addEndpoint(page);

  const importChooser = page.waitForEvent('filechooser');
  await page.getByRole('button', {name: 'Import'}).click();
  const chooser = await importChooser;
  await chooser.setFiles({
    name: 'roundtrip.pipeline.json',
    mimeType: 'application/json',
    buffer: Buffer.from(exportPayload),
  });
  const importDialog = page.getByRole('dialog');
  await expect(importDialog).toBeVisible({timeout: 5000});
  for (const select of await importDialog.locator('select').all()) {
    await select.selectOption({index: 1});
  }
  await importDialog.getByRole('button', {name: 'Import'}).click();
  await expect(page.getByPlaceholder('Pipeline name')).toHaveValue('Roundtrip Pipeline', {timeout: 10000});
  await expect(stepCard(page, 'Mid Steps Capsule')).toBeVisible();
  await expect(stepCard(page, 'Model Call')).toBeVisible();

  // Convert a simple pipeline to Capsule (V1 cannot convert pipelines that already contain instances)
  await page.getByTitle('Start a new empty pipeline').click();
  await expect(page.getByPlaceholder('Enter your prompt…')).toHaveValue('', {timeout: 5000});
  await selectStep(page, 'Model Call');
  await page.locator('select:has(option:has-text("select model"))').selectOption({index: 1});

  nextCapsulePromptName = 'Happy Path Capsule';
  await page.getByRole('button', {name: 'Convert to Capsule'}).click();
  await expect(page.getByRole('button', {name: '← Pipeline'})).toBeVisible({timeout: 5000});
  await page.getByRole('button', {name: '← Pipeline'}).click();
  await expect(stepCard(page, 'Happy Path Capsule')).toBeVisible();

  await page.getByTitle('Start a new empty pipeline').click();
  await expect(page.getByPlaceholder('Enter your prompt…')).toHaveValue('', {timeout: 5000});
  await expect(page.locator('.chain-step')).toHaveCount(1);
  await selectStep(page, 'Model Call');

  await expandLeftSection(page, 'Capsules');
  const capsuleRow = page.locator('.capsule-row').filter({
    has: page.locator('.capsule-row-name', {hasText: 'Happy Path Capsule'}),
  });
  await capsuleRow.getByRole('button', {name: '↓ Insert'}).click();
  await expect(page.locator('.chain-step')).toHaveCount(2, {timeout: 5000});
  await expect(stepCard(page, 'Happy Path Capsule')).toBeVisible();
  await expect(stepCard(page, 'Model Call')).toBeVisible();
});
