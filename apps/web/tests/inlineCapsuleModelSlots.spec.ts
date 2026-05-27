import {test, expect} from '@playwright/test';

const OLLAMA_BASE = 'http://localhost:11434';

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
        models: [
          {name: 'llama3.2:3b', modified_at: '', size: 0, digest: '', details: {}},
          {name: 'qwen3:8b', modified_at: '', size: 0, digest: '', details: {}},
          {name: 'deepseek-coder-v2:16b', modified_at: '', size: 0, digest: '', details: {}},
        ],
      }),
    }),
  );

  await page.reload();
  await expect(page.getByPlaceholder('Enter your prompt…')).toBeVisible({timeout: 10000});
});

function modelSelect(page: import('@playwright/test').Page) {
  return page.locator('.inspector-tab-panel select').filter({has: page.locator('option', {hasText: 'select model'})}).first();
}

test('inline capsule inner step model matches instance slot assignment', async ({page}) => {
  const now = '2026-01-01T00:00:00.000Z';
  await page.evaluate(async ({timestamp}) => {
    const capsule = {
      schemaVersion: 2,
      id: 'cap-slot-sync',
      name: 'Slot Sync Capsule',
      version: 'v1',
      status: 'locked',
      interface: {
        inputs: [],
        outputs: [{name: 'result', kind: 'text', sourceArtifactKey: 'domain.text'}],
        parameters: [],
        modelSlots: [{
          name: 'domain_router',
          suggestedBuckets: ['general'],
          required: true,
          description: 'Router slot',
        }],
      },
      steps: [{
        id: 'domain',
        type: 'model-call',
        label: 'domain',
        enabled: true,
        outputNamespace: 'domain',
        primaryOutputName: 'text',
        lastEditedAt: timestamp,
        config: {
          type: 'model-call',
          modelRef: {kind: 'slot', slotName: 'domain_router'},
          mode: 'generate',
          outputNames: ['text', 'rawResponse'],
        },
        prompt: {
          previousOutput: {enabled: false, placement: 'afterOwnPrompt', tagName: 'previous_output'},
          historyReads: [],
          blocks: [{id: 'p1', label: 'Prompt', tagName: 'system', body: 'test', enabled: true, source: 'system-default'}],
        },
      }],
      input: {raw: '', tagName: 'user_prompt', outputNamespace: 'user_prompt'},
      tests: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const pipeline = {
      schemaVersion: 2,
      id: 'pipe-slot-sync',
      name: 'Slot Sync Pipeline',
      input: {raw: '', tagName: 'user_prompt', outputNamespace: 'user_prompt'},
      steps: [{
        id: 'inst',
        type: 'capsule-instance',
        label: 'Slot Sync Capsule',
        enabled: true,
        outputNamespace: 'cap',
        primaryOutputName: 'text',
        lastEditedAt: timestamp,
        config: {
          type: 'capsule-instance',
          capsuleId: capsule.id,
          capsuleVersion: capsule.version,
          inputBindings: {},
          outputBindings: {result: 'cap.text'},
          displayMode: 'inline',
          inlineModified: true,
          modelSlotBindings: {
            domain_router: {kind: 'fixed', endpointId: 'ep-test', modelName: 'llama3.2:3b'},
          },
          inlineSteps: [{
            id: 'domain',
            type: 'model-call',
            label: 'domain',
            enabled: true,
            outputNamespace: 'domain',
            primaryOutputName: 'text',
            lastEditedAt: timestamp,
            config: {
              type: 'model-call',
              modelRef: {kind: 'fixed', endpointId: 'ep-test', modelName: 'deepseek-coder-v2:16b'},
              mode: 'generate',
              outputNames: ['text', 'rawResponse'],
            },
            prompt: {
              previousOutput: {enabled: false, placement: 'afterOwnPrompt', tagName: 'previous_output'},
              historyReads: [],
              blocks: [{id: 'p1', label: 'Prompt', tagName: 'system', body: 'test', enabled: true, source: 'system-default'}],
            },
          }],
          boundContentSignature: 'seeded',
        },
      }],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const endpoint = {
      id: 'ep-test',
      name: 'Test Ollama',
      baseUrl: 'http://localhost:11434',
      kind: 'ollama',
      enabled: true,
      browserAccess: 'available',
      authKind: 'none',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const models = ['llama3.2:3b', 'qwen3:8b', 'deepseek-coder-v2:16b'].map((name, i) => ({
      id: `m-${i}`,
      endpointId: 'ep-test',
      providerModelName: name,
      displayName: name,
      enabled: true,
      source: 'discovered',
    }));
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('lorca');
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['pipelines', 'capsules', 'endpoints', 'models'], 'readwrite');
      tx.objectStore('capsules').put(capsule);
      tx.objectStore('pipelines').put(pipeline);
      tx.objectStore('endpoints').put(endpoint);
      for (const model of models) tx.objectStore('models').put(model);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    localStorage.setItem('lorca:activePipelineId', pipeline.id);
  }, {timestamp: now});

  await page.reload();
  await expect(page.locator('.capsule-inline-step-label', {hasText: 'domain'})).toBeVisible({timeout: 10000});

  await page.locator('.capsule-inline-step-item', {hasText: 'domain'}).click();
  await page.getByRole('button', {name: 'Inspector'}).click();
  await expect(page.getByText('Model slot: domain_router')).toBeVisible({timeout: 5000});

  const select = modelSelect(page);
  await expect(select).toHaveValue('ep-test::llama3.2:3b');
  await expect(select).not.toHaveValue(/deepseek/);
});
