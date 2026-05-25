<script setup lang="ts">
defineProps<{
  active: boolean;
  ghost: boolean;
  label: string;
}>();
</script>

<template>
  <div
    v-if="active || ghost"
    :class="['drop-slot-card', active ? 'drop-slot-card-active' : 'drop-slot-card-ghost']"
    v-bind="active ? {'aria-label': label} : {'aria-hidden': 'true'}"
  >
    <div class="drop-slot-card-inner">
      <span v-if="active" class="drop-slot-label">{{ label }}</span>
    </div>
  </div>
</template>
