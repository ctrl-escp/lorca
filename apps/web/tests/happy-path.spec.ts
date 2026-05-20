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
  page.on('dialog', async (dialog) => {
    const msg = dialog.message();
    if (dialog.type() === 'prompt') {
      if (msg.includes('Capsule name')) await dialog.accept('Happy Path Capsule');
      else await dialog.accept('default');
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
  await stepCard(page, 'Acceptance Criteria').getByRole('button', {name: '▷ Run up to here'}).click();
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

  // Convert pipeline to Capsule and insert into a new pipeline
  await page.getByRole('button', {name: 'Convert to Capsule'}).click();
  await expect(page.getByText('Happy Path Capsule')).toBeVisible({timeout: 5000});

  await page.getByRole('button', {name: '← Pipeline'}).click();
  await expect(page.getByPlaceholder('Enter your prompt…')).toBeVisible({timeout: 5000});

  await page.getByTitle('Start a new empty pipeline').click();
  await expect(page.getByPlaceholder('Enter your prompt…')).toHaveValue('', {timeout: 5000});

  await expandLeftSection(page, 'Capsules');
  const capsuleRow = page.locator('.capsule-row').filter({hasText: 'Happy Path Capsule'});
  await capsuleRow.getByRole('button', {name: '↓ Insert'}).click();
  await expect(page.locator('.step-type-badge').filter({hasText: 'Capsule'})).toBeVisible();
  await expect(stepCard(page, 'Happy Path Capsule')).toBeVisible();
});
