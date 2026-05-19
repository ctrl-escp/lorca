import {defineStore} from 'pinia';
import {ref, computed} from 'vue';
import type {CapsuleDefinition} from '@lorca/core';

export const useCapsulesStore = defineStore('capsules', () => {
  const capsules = ref<CapsuleDefinition[]>([]);

  const lockedCapsules = computed(() =>
    capsules.value.filter((c) => c.status === 'locked'),
  );

  const draftCapsules = computed(() =>
    capsules.value.filter((c) => c.status === 'draft'),
  );

  function addCapsule(capsule: CapsuleDefinition) {
    capsules.value.push(capsule);
  }

  function updateCapsule(id: string, patch: Partial<CapsuleDefinition>) {
    const idx = capsules.value.findIndex((c) => c.id === id);
    if (idx !== -1) {
      capsules.value[idx] = {...capsules.value[idx]!, ...patch, updatedAt: new Date().toISOString()};
    }
  }

  function removeCapsule(id: string) {
    capsules.value = capsules.value.filter((c) => c.id !== id);
  }

  function getCapsule(id: string, version?: string): CapsuleDefinition | undefined {
    if (version) return capsules.value.find((c) => c.id === id && c.version === version);
    // Return latest version when no version specified
    return capsules.value
      .filter((c) => c.id === id)
      .sort((a, b) => {
        const av = parseInt(a.version.slice(1), 10);
        const bv = parseInt(b.version.slice(1), 10);
        return bv - av;
      })[0];
  }

  return {capsules, lockedCapsules, draftCapsules, addCapsule, updateCapsule, removeCapsule, getCapsule};
});
