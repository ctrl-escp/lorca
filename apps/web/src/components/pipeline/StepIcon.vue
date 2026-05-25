<script setup lang="ts">
import {computed} from 'vue';

const ICON_PATHS: Record<string, string[]> = {
  'arrow-up': ['M12 19V5', 'M5 12l7-7 7 7'],
  'arrow-down': ['M12 5v14', 'M19 12l-7 7-7-7'],
  copy: ['M8 8h10v10H8z', 'M6 14H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1'],
  eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  'eye-off': ['M3 3l18 18', 'M10.6 10.6a3 3 0 0 0 4.2 4.2', 'M9.9 4.2A10.8 10.8 0 0 1 12 4c6.5 0 10 8 10 8a18 18 0 0 1-3.1 4.2', 'M6.6 6.6C3.6 8.5 2 12 2 12s3.5 8 10 8c1.4 0 2.6-.3 3.8-.8'],
  trash: ['M3 6h18', 'M8 6V4h8v2', 'M6 6l1 14h10l1-14', 'M10 11v5', 'M14 11v5'],
  play: ['M4 5l10 7-10 7z', 'M18 5v14'],
  'play-from': ['M6 5v14', 'M10 5l10 7-10 7z'],
  refresh: ['M20 12a8 8 0 0 1-13.7 5.6', 'M4 12A8 8 0 0 1 17.7 6.4', 'M17 2v5h-5', 'M7 22v-5h5'],
  'message-square': ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
};

const props = defineProps<{name: string}>();

const paths = computed(() => ICON_PATHS[props.name] ?? []);
</script>

<template>
  <svg
    class="step-action-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path v-for="(d, i) in paths" :key="i" :d="d" />
  </svg>
</template>
