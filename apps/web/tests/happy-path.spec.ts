import {test, expect} from '@playwright/test';
import {
  importPipelineJson,
  lockSelectionAsCapsule,
  startNewPipeline,
} from './helpers/pipelineToolbar.js';
import {
  expectUserPromptReady,
  expectUserPromptText,
  fillUserPrompt,
} from './helpers/promptEditor.js';

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
  await expectUserPromptReady(page);
});

async function expandLeftSection(
  page: import('@playwright/test').Page,
  section: 'Endpoints' | 'Step library' | 'Capsules',
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

function stepCard(page: import('@playwright/test').Page, label: string) {
  return page.locator('.chain-step').filter({
    has: page.locator('.step-title').filter({hasText: new RegExp(`^${label}$`)}),
  }).first();
}

async function selectStep(page: import('@playwright/test').Page, label: string) {
  const card = stepCard(page, label);
  await expect(card).toBeVisible();
  await card.locator('.step-title').click();
  await expect(card).toHaveClass(/selected/);
}

async function insertSuggestionBefore(
  page: import('@playwright/test').Page,
  suggestionName: string,
) {
  await expandLeftSection(page, 'Step library');
  const row = page.locator('.suggestion-row').filter({hasText: suggestionName});
  await row.getByRole('button', {name: '↑ Before'}).click();
}

async function openInspector(page: import('@playwright/test').Page) {
  await page.getByRole('button', {name: 'Inspector'}).click();
}

async function openPromptTab(page: import('@playwright/test').Page, selectedLabel?: string) {
  await openInspector(page);
  if (selectedLabel) {
    await expect(page.getByRole('textbox', {name: 'Display label for this step'})).toHaveValue(selectedLabel);
  }
  await page.getByRole('tab', {name: 'Prompt'}).click();
}

test('happy path: suggestions, partial run, stale, disable, undo, capsule', async ({page}) => {
  test.setTimeout(120_000);

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

  await fillUserPrompt(page, 'Build a todo app with auth');

  // Run up to Acceptance Criteria — main model must not run
  await selectStep(page, 'Acceptance Criteria');
  await stepCard(page, 'Acceptance Criteria').getByRole('button', {name: 'Run up to here'}).click();
  await expect(page.getByRole('button', {name: 'Execute Pipeline'})).toBeEnabled({timeout: 15000});

  const callsAfterPartial = generateCallCount;
  expect(callsAfterPartial).toBe(2);

  // Acceptance Criteria has composed prompt context from Intent Extraction.
  await selectStep(page, 'Acceptance Criteria');
  await openPromptTab(page, 'Acceptance Criteria');
  await expect(stepCard(page, 'Acceptance Criteria').locator('.step-history-badge')).toBeVisible();

  // Previous output placement: before vs after own prompt blocks (XML preview order)
  const prevPlacement = page.locator('.pce-select').filter({has: page.locator('option[value="beforeOwnPrompt"]')});
  await page.locator('.pce-section').filter({hasText: 'Previous Output'}).getByRole('checkbox').check();
  await prevPlacement.selectOption('beforeOwnPrompt');
  const previewToggle = page.locator('.pce-section').filter({hasText: 'XML Preview'}).getByRole('button');
  await previewToggle.click();
  const previewBefore = page.locator('.pce-preview');
  await expect(previewBefore).toBeVisible();
  const xmlBefore = await previewBefore.textContent() ?? '';
  expect(xmlBefore).toContain('model output #1');
  expect(xmlBefore).not.toContain('…');
  const closePrev = xmlBefore.indexOf('</user_request>');
  const tagAfterPrev = xmlBefore.indexOf('<', closePrev + 1);
  expect(closePrev).toBeGreaterThanOrEqual(0);
  expect(tagAfterPrev).toBeGreaterThan(closePrev);

  await prevPlacement.selectOption('afterOwnPrompt');
  await expect(previewBefore).toBeVisible();
  const xmlAfter = await previewBefore.textContent() ?? '';
  const openPrev = xmlAfter.indexOf('<user_request>');
  const closePrevAfter = xmlAfter.lastIndexOf('</user_request>');
  expect(openPrev).toBeGreaterThanOrEqual(0);
  expect(closePrevAfter).toBeGreaterThan(xmlAfter.lastIndexOf('</', closePrevAfter - 1));

  // Edit intent prompt → downstream stale
  await selectStep(page, 'Intent Extraction');
  await openPromptTab(page, 'Intent Extraction');
  const intentBody = page.locator('.pce-body .cm-content').first();
  await intentBody.fill('Extract intent with extra detail.\nRespond with JSON only.');
  await intentBody.blur();

  // Acceptance Criteria ran in the partial run and is downstream of Intent
  await expect(stepCard(page, 'Acceptance Criteria').locator('.run-stale')).toHaveText(/outdated/i, {timeout: 5000});

  // Require Intent output for Acceptance Criteria so disabling Intent blocks downstream execution
  await selectStep(page, 'Acceptance Criteria');
  await openPromptTab(page, 'Acceptance Criteria');
  await page.locator('.pce-section').filter({hasText: 'History Inputs'}).getByLabel('Stop if missing').check();

  // Disable intent extraction → acceptance criteria blocked
  await selectStep(page, 'Intent Extraction');
  await stepCard(page, 'Intent Extraction').getByTitle('Disable step').click();
  await expect(stepCard(page, 'Intent Extraction').locator('.step-disabled-badge')).toBeVisible();
  await expect(stepCard(page, 'Acceptance Criteria').locator('.run-blocked')).toHaveText(/blocked/i, {timeout: 5000});

  // Undo disable
  await page.getByTitle(/^Undo /).click();
  await expect(stepCard(page, 'Intent Extraction').locator('.step-disabled-badge')).not.toBeVisible();
  await expect(stepCard(page, 'Acceptance Criteria').locator('.run-blocked')).not.toBeVisible();

  // Run full pipeline
  await page.getByRole('button', {name: 'Execute Pipeline'}).click();
  await expect(page.getByRole('button', {name: 'Execute Pipeline'})).toBeEnabled({timeout: 15000});
  const callsAfterFull = generateCallCount;
  expect(callsAfterFull - callsAfterPartial).toBe(3);

  await page.getByRole('button', {name: 'Output', exact: true}).click();
  await expect(page.locator('.output-panel')).toContainText(`model output #${callsAfterFull}`, {timeout: 5000});

  // Extract Intent + Acceptance Criteria into a mid-pipeline Capsule
  await selectStep(page, 'Intent Extraction');
  await stepCard(page, 'Acceptance Criteria').click({modifiers: ['Shift']});
  await lockSelectionAsCapsule(page, 'Mid Steps Capsule');
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
  await expectUserPromptReady(page);
  await addEndpoint(page);

  await importPipelineJson(page, exportPayload);
  await expect(page.getByRole('button', {name: 'Roundtrip Pipeline ›'})).toBeVisible({timeout: 10000});
  await expect(stepCard(page, 'Mid Steps Capsule')).toBeVisible();
  await expect(stepCard(page, 'Model Call')).toBeVisible();

  // Convert a simple pipeline to Capsule.
  await startNewPipeline(page);
  await expectUserPromptText(page, '');
  await selectStep(page, 'Model Call');
  await page.locator('select:has(option:has-text("select model"))').selectOption({index: 1});

  await lockSelectionAsCapsule(page, 'Happy Path Capsule');
  await expect(stepCard(page, 'Happy Path Capsule')).toBeVisible();

  await startNewPipeline(page);
  await expectUserPromptText(page, '');
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
