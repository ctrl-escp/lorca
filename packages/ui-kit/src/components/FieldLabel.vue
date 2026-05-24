<template>
  <label class="field-label" :title="title">
    <span>{{ label }}</span><span v-if="required" class="req-asterisk" aria-hidden="true">*</span>
  </label>
</template>

<script setup lang="ts">
defineProps<{
  label: string;
  required?: boolean;
  title?: string;
}>();
</script>

<style scoped>
.field-label {
  font-size: 0.72rem;
  color: var(--text-label);
  display: inline-flex;
  align-items: baseline;
  gap: 0;
  cursor: help;
}
.req-asterisk {
  color: #e05555;
  margin-left: 2px;
  font-weight: 600;
}
</style>
