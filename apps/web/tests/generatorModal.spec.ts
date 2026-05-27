import {test, expect} from '@playwright/test';
import {expectUserPromptReady} from './helpers/promptEditor.js';
import {
  addOllamaEndpoint,
  expectGeneratorDescription,
  fillGeneratorDescription,
  generatorDialog,
  GENERATOR_PLAN_DEBATE_SHORT,
  GENERATOR_PLAN_RESOLVED,
  GENERATOR_PLAN_UNRESOLVED,
  mockOllamaWithGeneratorPlan,
  openGeneratorModal,
  stepCard,
} from './helpers/pipelineGenerator.js';

test.setTimeout(60_000);

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
  await page.reload();
  await expectUserPromptReady(page);
});

test('generate with bucket-assigned model enables Apply directly', async ({page}) => {
  await mockOllamaWithGeneratorPlan(page, GENERATOR_PLAN_RESOLVED);
  await addOllamaEndpoint(page);
  await openGeneratorModal(page);

  const dialog = generatorDialog(page);
  await fillGeneratorDescription(page, 'Summarize the user request');
  await dialog.getByRole('button', {name: 'Generate'}).click();

  await expect(dialog.getByText('Summarize')).toBeVisible({timeout: 15000});
  await expect(dialog.getByRole('button', {name: 'Apply'})).toBeEnabled({timeout: 5000});
  await expect(dialog.getByRole('button', {name: 'Resolve models…'})).toBeDisabled();

  await dialog.getByRole('button', {name: 'Apply'}).click();
  await expect(stepCard(page, 'Summarize')).toBeVisible({timeout: 10000});
});

test('resolve models then apply commits generated steps', async ({page}) => {
  await mockOllamaWithGeneratorPlan(page, GENERATOR_PLAN_UNRESOLVED);
  await addOllamaEndpoint(page);
  await openGeneratorModal(page);

  const dialog = generatorDialog(page);
  await fillGeneratorDescription(page, 'Summarize with remap');
  await dialog.getByRole('button', {name: 'Generate'}).click();
  await expect(dialog.getByText('Summarize')).toBeVisible({timeout: 15000});

  await expect(dialog.getByRole('button', {name: 'Apply'})).toBeDisabled();
  await dialog.getByRole('button', {name: 'Resolve models…'}).click();

  const remapDialog = page.getByRole('dialog', {name: 'Import pipeline'});
  await expect(remapDialog).toBeVisible();
  await remapDialog.locator('select').first().selectOption({index: 1});
  await remapDialog.getByRole('button', {name: 'Import'}).click();
  await expect(remapDialog).toBeHidden({timeout: 5000});
  await expect(stepCard(page, 'Summarize')).toBeVisible({timeout: 10000});
});

test('multi-step debate-shaped plan previews and applies', async ({page}) => {
  await mockOllamaWithGeneratorPlan(page, GENERATOR_PLAN_DEBATE_SHORT);
  await addOllamaEndpoint(page);
  await openGeneratorModal(page);

  const dialog = generatorDialog(page);
  await fillGeneratorDescription(page, 'Debate pipeline from tmp-notes');
  await dialog.getByRole('button', {name: 'Generate'}).click();

  await expect(dialog.getByText('Extract hypothesis')).toBeVisible({timeout: 15000});
  await expect(dialog.getByText('Expert — support')).toBeVisible();
  await expect(dialog.getByText('Debate summary')).toBeVisible();
  await dialog.getByRole('button', {name: 'Apply'}).click();

  await expect(stepCard(page, 'Extract hypothesis')).toBeVisible({timeout: 10000});
  await expect(stepCard(page, 'Expert — support')).toBeVisible();
  await expect(stepCard(page, 'Debate summary')).toBeVisible();
});

test('session persists on close; Clear all resets', async ({page}) => {
  await mockOllamaWithGeneratorPlan(page, GENERATOR_PLAN_RESOLVED);
  await addOllamaEndpoint(page);
  await openGeneratorModal(page);

  const dialog = generatorDialog(page);
  const description = 'Persistent debate pipeline';
  await fillGeneratorDescription(page, description);
  await dialog.getByRole('button', {name: 'Generate'}).click();
  await expect(dialog.getByText('Summarize')).toBeVisible({timeout: 15000});

  await dialog.getByRole('button', {name: 'Cancel'}).click();
  await expect(dialog).toBeHidden();

  await openGeneratorModal(page);
  await expectGeneratorDescription(page, description);
  await expect(dialog.getByText('Summarize')).toBeVisible();

  await dialog.getByRole('button', {name: 'Clear all'}).click();
  await expectGeneratorDescription(page, '');
  await expect(dialog.getByText('Summarize')).toHaveCount(0);
});
