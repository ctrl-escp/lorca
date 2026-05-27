import {test, expect} from '@playwright/test';

const OLLAMA_BASE = 'http://localhost:11434';

/** Graph-only capsule export (no steps[]) — legacy imports are rejected. */
function graphOnlyCapsuleExport() {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    exportedAt: now,
    app: 'lorca',
    kind: 'capsule',
    capsule: {
      schemaVersion: 2,
      id: 'cap-graph-e2e',
      name: 'Graph Legacy Capsule',
      version: 'v1',
      status: 'locked',
      interface: {
        inputs: [],
        outputs: [{name: 'note', kind: 'text', sourceArtifactKey: 'note.text'}],
        parameters: [],
        modelSlots: [],
      },
      steps: [],
      nodes: [
        {id: 'in', type: 'input'},
        {id: 'mt', type: 'manual-text', artifactPrefix: 'note', text: 'legacy note body'},
      ],
      edges: [
        {id: 'e1', fromNodeId: 'in', fromOutput: 'xml', toNodeId: 'mt', toInput: 'input'},
      ],
      outputRef: {nodeId: 'mt', outputName: 'text'},
      tests: [],
      createdAt: now,
      updatedAt: now,
    },
  };
}

/** Legacy V1 pipeline stored in IndexedDB (no steps[]) — migrated on app load. */
function legacyGraphPipelineRecord() {
  const inputId = 'input-1';
  const wrapperId = 'wrap-1';
  const modelId = 'model-1';
  const now = '2026-01-01T00:00:00.000Z';
  return {
    schemaVersion: 1,
    id: 'pipe-legacy-e2e',
    name: 'Legacy Graph Pipeline',
    inputArtifactName: 'user_prompt',
    nodes: [
      {id: inputId, type: 'input'},
      {
        id: wrapperId,
        type: 'prompt-wrapper',
        artifactPrefix: 'wrapped',
        config: {
          tagName: 'user',
          instructionText: 'Wrap the input.',
          includeInputArtifact: true,
          inputPlacement: 'before-instructions',
        },
      },
      {
        id: modelId,
        type: 'model-call',
        title: 'Main Model',
        artifactPrefix: 'answer',
        config: {
          modelRef: {kind: 'fixed', endpointId: 'ep-old', modelName: 'llama3:latest'},
          mode: 'generate',
          inputArtifactRef: 'wrapped.text',
          systemPrompt: 'Answer the user.',
        },
      },
    ],
    edges: [
      {id: 'e1', fromNodeId: inputId, fromOutput: 'xml', toNodeId: wrapperId, toInput: 'input'},
      {id: 'e2', fromNodeId: wrapperId, fromOutput: 'text', toNodeId: modelId, toInput: 'input'},
    ],
    outputRef: {nodeId: modelId, outputName: 'text'},
    createdAt: now,
    updatedAt: now,
  };
}

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

  await page.route(`${OLLAMA_BASE}/api/tags`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        models: [{name: 'llama3:latest', modified_at: '', size: 0, digest: '', details: {}}],
      }),
    }),
  );

  await page.reload();
  await expect(page.getByPlaceholder('Pipeline name')).toBeVisible({timeout: 10000});
});

async function expandLeftSection(
  page: import('@playwright/test').Page,
  section: 'Capsules',
) {
  const toggle = page.locator('.section-toggle').filter({hasText: section});
  if (await toggle.getAttribute('aria-expanded') !== 'true') {
    await toggle.click();
  }
}

test('e2e: reject graph-only capsule import', async ({page}) => {
  const exportPayload = JSON.stringify(graphOnlyCapsuleExport());

  await expandLeftSection(page, 'Capsules');
  const importChooser = page.waitForEvent('filechooser');
  await page.getByTitle('Import a Capsule from a JSON file').click();
  const chooser = await importChooser;
  await chooser.setFiles({
    name: 'graph-legacy.capsule.json',
    mimeType: 'application/json',
    buffer: Buffer.from(exportPayload),
  });

  await expect(page.getByText(/legacy graph-only/i)).toBeVisible({timeout: 5000});
  await expect(page.locator('.capsule-row-name').filter({hasText: 'Graph Legacy Capsule'})).toHaveCount(0);
});

test('e2e: load graph-only pipeline from IndexedDB as V2 step chain', async ({page}) => {
  const legacy = legacyGraphPipelineRecord();

  await page.evaluate((pipeline) => {
    localStorage.setItem('lorca:activePipelineId', pipeline.id);
    return new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('lorca');
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('pipelines', 'readwrite');
        tx.objectStore('pipelines').clear();
        tx.objectStore('pipelines').put(pipeline);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
    });
  }, legacy);

  await page.reload();
  await expect(page.getByPlaceholder('Pipeline name')).toHaveValue('Legacy Graph Pipeline', {timeout: 10000});
  await expect(page.locator('.chain-editor .chain-step')).toHaveCount(2);
  await expect(page.locator('.step-title').filter({hasText: 'Main Model'})).toBeVisible();
  await expect(page.locator('.step-type-badge').filter({hasText: 'Text'})).toBeVisible();
});
