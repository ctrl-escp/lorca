<template>
  <section class="pane-section" :class="{expanded}">
    <div class="section-header" @click="$emit('toggle')">
      <button type="button" class="section-toggle" :aria-expanded="expanded" :title="title">
        <span class="chevron" :class="{open: expanded}">›</span>
        <span class="section-title" :class="titleClass">
          {{ title }}
          <span v-if="count !== undefined" class="section-count">({{ count }})</span>
        </span>
      </button>
      <div v-if="$slots.actions" class="section-actions" @click.stop>
        <slot name="actions" />
      </div>
    </div>
    <div v-if="expanded" class="section-body">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  expanded: boolean;
  title: string;
  titleClass?: string;
  count?: number;
}>();

defineEmits<{toggle: []}>();
</script>

<style scoped>
.pane-section {
  flex-shrink: 0; border-bottom: 1px solid #222;
  display: flex; flex-direction: column; min-height: 0;
}
.pane-section.expanded { flex: 1; min-height: 0; }

.section-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 0.9rem 1.1rem; cursor: pointer; flex-shrink: 0; user-select: none;
}
.section-header:hover { background: #151515; }

.section-toggle {
  display: flex; align-items: center; gap: 0.5rem;
  background: none; border: none; padding: 0; cursor: pointer;
  color: inherit; flex: 1; min-width: 0; text-align: left;
}

.chevron { display: inline-block; font-size: 1.1rem; color: var(--text-secondary); transition: transform 0.15s; width: 1rem; flex-shrink: 0; }
.chevron.open { transform: rotate(90deg); color: var(--accent); }

.section-title { font-size: 1rem; font-weight: 700; letter-spacing: 0.01em; }
.section-count { font-weight: 500; color: var(--text-secondary); }

.section-actions { display: flex; gap: 0.35rem; }

.section-body { flex: 1; min-height: 0; overflow-y: auto; padding: 0 1rem 1rem; display: flex; flex-direction: column; gap: 0.5rem; }

.icon-btn { background: none; border: 1px solid #333; color: var(--text-label); border-radius: 5px; width: 36px; height: 36px; cursor: pointer; font-size: 1.2rem; line-height: 1; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.icon-btn:hover:not(:disabled) { background: #222; color: #ccc; }
.icon-btn:disabled { opacity: 0.3; cursor: default; }
.icon-btn.active { background: var(--accent-bg); border-color: var(--accent-border); color: var(--accent); }

.empty-hint { font-size: 0.88rem; color: var(--text-secondary); margin: 0; }
</style>
