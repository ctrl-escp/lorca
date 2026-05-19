<template>
  <div v-if="errors.length > 0" class="import-errors" role="alert">
    <strong>Import failed</strong>
    <ul>
      <li v-for="(err, idx) in errors" :key="idx">{{ err }}</li>
    </ul>
    <button type="button" class="dismiss" title="Dismiss import error messages" @click="emit('dismiss')">Dismiss</button>
  </div>
</template>

<script setup lang="ts">
defineProps<{errors: string[]}>();
const emit = defineEmits<{dismiss: []}>();
</script>

<style scoped>
.import-errors {
  margin: 0.5rem 0.75rem 0;
  padding: 0.5rem 0.75rem;
  border: 1px solid #4d2222;
  background: #2d1a1a;
  border-radius: 4px;
  font-size: 0.78rem;
  color: #e8a0a0;
}
.import-errors ul { margin: 0.35rem 0 0; padding-left: 1.1rem; }
.dismiss {
  margin-top: 0.35rem;
  background: none;
  border: 1px solid #4d2222;
  color: #e07070;
  border-radius: 3px;
  padding: 2px 8px;
  font-size: 0.72rem;
  cursor: pointer;
}
</style>
