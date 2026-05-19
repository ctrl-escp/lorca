export function pickJsonFile(onLoad: (text: string) => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    onLoad(await file.text());
  };
  input.click();
}

export async function readExportedJsonFile(page: {locator: (sel: string) => {setInputFiles: (files: unknown) => Promise<void>}}, path: string) {
  await page.locator('input[type="file"]').setInputFiles(path);
}
