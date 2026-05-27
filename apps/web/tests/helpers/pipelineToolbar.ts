import {expect, type Locator, type Page} from '@playwright/test';

/** Click a pipeline toolbar action, opening ⋯ More when the button is overflow-hidden. */
export async function clickToolbarAction(page: Page, name: string): Promise<void> {
  const inline = page.getByRole('button', {name, exact: true});
  if (await inline.isVisible()) {
    await inline.click();
    return;
  }
  await page.getByRole('button', {name: '⋯ More'}).click();
  await page.getByRole('button', {name, exact: true}).click();
}

export async function openPipelineImportModal(page: Page): Promise<void> {
  await clickToolbarAction(page, 'Import');
  const pasteDialog = page.getByRole('dialog').filter({has: page.getByText('Import Pipeline')});
  await expect(pasteDialog).toBeVisible({timeout: 5000});
}

async function pasteJsonIntoImportModal(page: Page, pasteDialog: Locator, json: string): Promise<void> {
  const jsonEditor = pasteDialog.locator('.json-input .cm-content');
  await jsonEditor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(json);
  const importBtn = pasteDialog.locator('.dialog-footer .btn-primary');
  await expect(importBtn).toBeEnabled({timeout: 5000});
  // Playwright click can be blocked by the CodeMirror overlay; DOM click is reliable here.
  await importBtn.evaluate((el) => (el as HTMLButtonElement).click());
}

async function completeImportRemap(page: Page): Promise<void> {
  const remapDialog = page.getByRole('dialog').filter({has: page.getByRole('heading', {name: 'Import pipeline'})});
  await expect(remapDialog).toBeVisible({timeout: 5000});
  for (const select of await remapDialog.locator('select').all()) {
    await select.selectOption({index: 1});
  }
  await remapDialog.getByRole('button', {name: 'Import'}).click();
}

/** Paste pipeline export JSON through Import Pipeline → remap (when needed) → confirm. */
export async function importPipelineJson(page: Page, exportPayload: string): Promise<void> {
  await openPipelineImportModal(page);
  const pasteDialog = page.getByRole('dialog').filter({has: page.getByText('Import Pipeline')});
  await pasteJsonIntoImportModal(page, pasteDialog, exportPayload);
  await completeImportRemap(page);
}

/** Lock the current step selection (or whole pipeline) as a named Capsule. */
export async function lockSelectionAsCapsule(page: Page, capsuleName: string): Promise<void> {
  await clickToolbarAction(page, 'Lock as Capsule');
  const confirm = page.getByRole('dialog').filter({has: page.getByText('Lock as Capsule', {exact: true})});
  await expect(confirm).toBeVisible({timeout: 5000});
  await confirm.getByRole('button', {name: 'Lock'}).click();
  const prompt = page.getByRole('dialog').filter({has: page.getByText('Name this Capsule')});
  await expect(prompt).toBeVisible({timeout: 5000});
  await prompt.getByLabel('Capsule name').fill(capsuleName);
  await prompt.getByRole('button', {name: 'Save'}).click();
}

/** Start a fresh empty pipeline (confirms the destructive New Pipeline dialog). */
export async function startNewPipeline(page: Page): Promise<void> {
  await page.getByTitle('Start a new empty pipeline').click();
  const confirm = page.getByRole('dialog').filter({has: page.locator('.dialog-title', {hasText: /^New Pipeline$/})});
  await confirm.getByRole('button', {name: 'New Pipeline'}).click();
}
