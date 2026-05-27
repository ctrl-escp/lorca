# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: apps/web/tests/generatorModal.spec.ts >> multi-step debate-shaped plan previews and applies
- Location: apps/web/tests/generatorModal.spec.ts:70:1

# Error details

```
Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
Call log:
  - navigating to "/", waiting until "load"

```

# Test source

```ts
  1   | import {test, expect} from '@playwright/test';
  2   | import {expectUserPromptReady} from './helpers/promptEditor.js';
  3   | import {
  4   |   addOllamaEndpoint,
  5   |   expectGeneratorDescription,
  6   |   fillGeneratorDescription,
  7   |   generatorDialog,
  8   |   GENERATOR_PLAN_DEBATE_SHORT,
  9   |   GENERATOR_PLAN_RESOLVED,
  10  |   GENERATOR_PLAN_UNRESOLVED,
  11  |   mockOllamaWithGeneratorPlan,
  12  |   openGeneratorModal,
  13  |   stepCard,
  14  | } from './helpers/pipelineGenerator.js';
  15  | 
  16  | test.setTimeout(60_000);
  17  | 
  18  | test.beforeEach(async ({page}) => {
> 19  |   await page.goto('/');
      |              ^ Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
  20  |   await page.evaluate(() =>
  21  |     new Promise<void>((resolve) => {
  22  |       const req = indexedDB.deleteDatabase('lorca');
  23  |       req.onsuccess = () => resolve();
  24  |       req.onerror = () => resolve();
  25  |       req.onblocked = () => resolve();
  26  |     }),
  27  |   );
  28  |   await page.reload();
  29  |   await expectUserPromptReady(page);
  30  | });
  31  | 
  32  | test('generate with bucket-assigned model enables Apply directly', async ({page}) => {
  33  |   await mockOllamaWithGeneratorPlan(page, GENERATOR_PLAN_RESOLVED);
  34  |   await addOllamaEndpoint(page);
  35  |   await openGeneratorModal(page);
  36  | 
  37  |   const dialog = generatorDialog(page);
  38  |   await fillGeneratorDescription(page, 'Summarize the user request');
  39  |   await dialog.getByRole('button', {name: 'Generate'}).click();
  40  | 
  41  |   await expect(dialog.getByText('Summarize')).toBeVisible({timeout: 15000});
  42  |   await expect(dialog.getByRole('button', {name: 'Apply'})).toBeEnabled({timeout: 5000});
  43  |   await expect(dialog.getByRole('button', {name: 'Resolve models…'})).toBeDisabled();
  44  | 
  45  |   await dialog.getByRole('button', {name: 'Apply'}).click();
  46  |   await expect(stepCard(page, 'Summarize')).toBeVisible({timeout: 10000});
  47  | });
  48  | 
  49  | test('resolve models then apply commits generated steps', async ({page}) => {
  50  |   await mockOllamaWithGeneratorPlan(page, GENERATOR_PLAN_UNRESOLVED);
  51  |   await addOllamaEndpoint(page);
  52  |   await openGeneratorModal(page);
  53  | 
  54  |   const dialog = generatorDialog(page);
  55  |   await fillGeneratorDescription(page, 'Summarize with remap');
  56  |   await dialog.getByRole('button', {name: 'Generate'}).click();
  57  |   await expect(dialog.getByText('Summarize')).toBeVisible({timeout: 15000});
  58  | 
  59  |   await expect(dialog.getByRole('button', {name: 'Apply'})).toBeDisabled();
  60  |   await dialog.getByRole('button', {name: 'Resolve models…'}).click();
  61  | 
  62  |   const remapDialog = page.getByRole('dialog', {name: 'Import pipeline'});
  63  |   await expect(remapDialog).toBeVisible();
  64  |   await remapDialog.locator('select').first().selectOption({index: 1});
  65  |   await remapDialog.getByRole('button', {name: 'Import'}).click();
  66  |   await expect(remapDialog).toBeHidden({timeout: 5000});
  67  |   await expect(stepCard(page, 'Summarize')).toBeVisible({timeout: 10000});
  68  | });
  69  | 
  70  | test('multi-step debate-shaped plan previews and applies', async ({page}) => {
  71  |   await mockOllamaWithGeneratorPlan(page, GENERATOR_PLAN_DEBATE_SHORT);
  72  |   await addOllamaEndpoint(page);
  73  |   await openGeneratorModal(page);
  74  | 
  75  |   const dialog = generatorDialog(page);
  76  |   await fillGeneratorDescription(page, 'Debate pipeline from tmp-notes');
  77  |   await dialog.getByRole('button', {name: 'Generate'}).click();
  78  | 
  79  |   await expect(dialog.getByText('Extract hypothesis')).toBeVisible({timeout: 15000});
  80  |   await expect(dialog.getByText('Expert — support')).toBeVisible();
  81  |   await expect(dialog.getByText('Debate summary')).toBeVisible();
  82  |   await dialog.getByRole('button', {name: 'Apply'}).click();
  83  | 
  84  |   await expect(stepCard(page, 'Extract hypothesis')).toBeVisible({timeout: 10000});
  85  |   await expect(stepCard(page, 'Expert — support')).toBeVisible();
  86  |   await expect(stepCard(page, 'Debate summary')).toBeVisible();
  87  | });
  88  | 
  89  | test('session persists on close; Clear all resets', async ({page}) => {
  90  |   await mockOllamaWithGeneratorPlan(page, GENERATOR_PLAN_RESOLVED);
  91  |   await addOllamaEndpoint(page);
  92  |   await openGeneratorModal(page);
  93  | 
  94  |   const dialog = generatorDialog(page);
  95  |   const description = 'Persistent debate pipeline';
  96  |   await fillGeneratorDescription(page, description);
  97  |   await dialog.getByRole('button', {name: 'Generate'}).click();
  98  |   await expect(dialog.getByText('Summarize')).toBeVisible({timeout: 15000});
  99  | 
  100 |   await dialog.getByRole('button', {name: 'Cancel'}).click();
  101 |   await expect(dialog).toBeHidden();
  102 | 
  103 |   await openGeneratorModal(page);
  104 |   await expectGeneratorDescription(page, description);
  105 |   await expect(dialog.getByText('Summarize')).toBeVisible();
  106 | 
  107 |   await dialog.getByRole('button', {name: 'Clear all'}).click();
  108 |   await expectGeneratorDescription(page, '');
  109 |   await expect(dialog.getByText('Summarize')).toHaveCount(0);
  110 | });
  111 | 
```