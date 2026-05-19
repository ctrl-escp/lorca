import {defineStore} from 'pinia';
import {ref, computed} from 'vue';
import type {CapsuleDefinition} from '@lorca/core';
import {getDb} from '@lorca/storage';
import {
  lockCapsule,
  createDraftFromLocked,
  getBuiltinExamples,
  getBuiltinExample,
  duplicateExampleCapsule,
} from '@lorca/capsules';
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

  const builtinExamples = computed(() => getBuiltinExamples());

  const draftCapsules = computed(() =>
    capsules.value.filter((c) => c.status === 'draft'),
  );

  async function load() {
    if (loaded.value) return;
    capsules.value = await getDb().capsules.toArray();
    loaded.value = true;
  }

  function addCapsule(capsule: CapsuleDefinition) {
    const plain = cloneForStorage(capsule);
    capsules.value.push(plain);
    void getDb().capsules.put(plain);
  }

  function updateCapsule(id: string, patch: Partial<CapsuleDefinition>) {
    const idx = capsules.value.findIndex((c) => c.id === id);
    if (idx !== -1) {
      const updated = cloneForStorage({...capsules.value[idx]!, ...patch, updatedAt: new Date().toISOString()});
      capsules.value[idx] = updated;
      void getDb().capsules.put(updated);
    }
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
    capsules.value[idx] = result.value;
    void getDb().capsules.put(cloneForStorage(result.value));
    return {ok: true};
  }

  function editLockedCapsule(id: string): string | null {
    const locked = capsules.value.find((c) => c.id === id && c.status === 'locked');
    if (!locked) return null;
    const newCapsuleId = newId('cap');
    const draft = createDraftFromLocked(locked, newCapsuleId);
    capsules.value.push(draft);
    void getDb().capsules.put(cloneForStorage(draft));
    return newCapsuleId;
  }

  return {
    capsules,
    lockedCapsules,
    builtinExamples,
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
  };
});
