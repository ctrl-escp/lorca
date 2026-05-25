import {defineStore} from 'pinia';
import {ref, computed} from 'vue';
import type {CapsuleDefinition} from '@lorca/core';
import {getDb, normalizePersistedCapsule, capsuleNeedsPersistenceRewrite} from '@lorca/storage';
import {
  lockCapsule,
  createDraftFromLocked,
  getBuiltinExamples,
  getBuiltinExample,
  duplicateExampleCapsule,
} from '@lorca/capsules';
import {ensureCapsuleStepChain} from '@lorca/pipeline';
import {newId} from '../utils/id.js';
import {cloneForStorage} from '../utils/storage.js';

export const useCapsulesStore = defineStore('capsules', () => {
  const capsules = ref<CapsuleDefinition[]>([]);
  const loaded = ref(false);

  const lockedCapsules = computed(() => {
    const userLocked = capsules.value.filter((c) => c.status === 'locked');
    const userIds = new Set(userLocked.map((c) => c.id));
    const builtins = getBuiltinExamples().filter((c) => !userIds.has(c.id));
    return [...userLocked, ...builtins];
  });

  const draftCapsules = computed(() =>
    capsules.value.filter((c) => c.status === 'draft'),
  );

  const allCapsules = computed(() => [
    ...draftCapsules.value,
    ...lockedCapsules.value,
  ]);

  async function load() {
    if (loaded.value) return;
    const fromDb = await getDb().capsules.toArray();
    const normalized = fromDb.map((c) => normalizePersistedCapsule(c));
    for (let i = 0; i < fromDb.length; i++) {
      const before = fromDb[i]!;
      const after = normalized[i]!;
      if (capsuleNeedsPersistenceRewrite(before, after)) {
        await getDb().capsules.put(cloneForStorage(after));
      }
    }
    const dbIds = new Set(normalized.map((c) => c.id));
    const inMemoryOnly = capsules.value.filter((c) => !dbIds.has(c.id));
    capsules.value = [...normalized, ...inMemoryOnly];
    loaded.value = true;
  }

  function addCapsule(capsule: CapsuleDefinition) {
    const plain = cloneForStorage(normalizePersistedCapsule(capsule));
    capsules.value.push(plain);
    void getDb().capsules.put(plain);
  }

  function updateCapsule(id: string, patch: Partial<CapsuleDefinition>) {
    const idx = capsules.value.findIndex((c) => c.id === id);
    if (idx === -1) return;
    const {
      id: _id,
      status: _status,
      lockedAt: _lockedAt,
      version: _version,
      createdAt: _createdAt,
      ...mutablePatch
    } = patch as CapsuleDefinition;
    const updated = cloneForStorage(normalizePersistedCapsule({
      ...capsules.value[idx]!,
      ...mutablePatch,
      updatedAt: new Date().toISOString(),
    }));
    capsules.value[idx] = updated;
    void getDb().capsules.put(updated);
  }

  function removeCapsule(id: string) {
    capsules.value = capsules.value.filter((c) => c.id !== id);
    void getDb().capsules.delete(id);
  }

  function getCapsule(id: string, version?: string): CapsuleDefinition | undefined {
    if (version) {
      const match = capsules.value.find((c) => c.id === id && c.version === version);
      return match ?? getBuiltinExample(id, version);
    }
    const fromDb = capsules.value
      .filter((c) => c.id === id)
      .sort((a, b) => {
        const av = parseInt(a.version.slice(1), 10);
        const bv = parseInt(b.version.slice(1), 10);
        return bv - av;
      })[0];
    return fromDb ?? getBuiltinExample(id);
  }

  function duplicateCapsule(sourceId: string): string | null {
    const source = getCapsule(sourceId);
    if (!source) return null;
    const id = newId('cap');
    const now = new Date().toISOString();
    const copy = cloneForStorage({
      ...source,
      id,
      name: `${source.name} (copy)`,
      version: 'v1' as const,
      status: 'draft' as const,
      createdAt: now,
      updatedAt: now,
    }) as CapsuleDefinition;
    delete (copy as {lockedAt?: string}).lockedAt;
    addCapsule(copy);
    return id;
  }

  function duplicateFromExample(exampleId: string): string | null {
    const example = getBuiltinExample(exampleId);
    if (!example) return null;
    const id = newId('cap');
    addCapsule(duplicateExampleCapsule(example, id));
    return id;
  }

  function lockCapsuleById(id: string): {ok: true} | {ok: false; message: string} {
    const idx = capsules.value.findIndex((c) => c.id === id && c.status === 'draft');
    if (idx === -1) return {ok: false, message: 'Draft capsule not found'};
    const result = lockCapsule(capsules.value[idx]!);
    if (!result.ok) return {ok: false, message: result.error.message};
    const plain = cloneForStorage(normalizePersistedCapsule(result.value));
    capsules.value[idx] = plain;
    void getDb().capsules.put(plain);
    return {ok: true};
  }

  function editLockedCapsule(id: string): string | null {
    const locked = getCapsule(id);
    if (locked?.status !== 'locked') return null;
    const newCapsuleId = newId('cap');
    const draft = normalizePersistedCapsule(ensureCapsuleStepChain(createDraftFromLocked(locked, newCapsuleId)));
    capsules.value.push(draft);
    void getDb().capsules.put(cloneForStorage(draft));
    return newCapsuleId;
  }

  return {
    capsules,
    allCapsules,
    lockedCapsules,
    draftCapsules,
    loaded,
    load,
    addCapsule,
    updateCapsule,
    removeCapsule,
    getCapsule,
    lockCapsuleById,
    editLockedCapsule,
    duplicateFromExample,
    duplicateCapsule,
  };
});
