import {expect, type Locator, type Page} from '@playwright/test';

export function userPromptEditor(page: Page): Locator {
  return page.locator('.user-prompt-input .cm-content').first();
}

export async function expectUserPromptReady(page: Page): Promise<void> {
  await expect(userPromptEditor(page)).toBeVisible({timeout: 10000});
}

export async function fillUserPrompt(page: Page, value: string): Promise<void> {
  await userPromptEditor(page).fill(value);
}

export async function expectUserPromptText(page: Page, value: string): Promise<void> {
  const editor = userPromptEditor(page);
  if (value === '') {
    await expect(editor).toBeVisible();
    await expect.poll(async () => {
      const text = (await editor.innerText()).trim();
      return text === '' || text === 'Enter your prompt…';
    }).toBe(true);
    return;
  }
  await expect(editor).toHaveText(value);
}
