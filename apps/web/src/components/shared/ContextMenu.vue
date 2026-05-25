<template>
  <Teleport to="body">
    <nav
      v-if="open"
      ref="menuRef"
      class="context-menu"
      :style="menuStyle"
      role="menu"
      @click.stop
      @pointerdown.stop
      @contextmenu.prevent.stop
    >
      <template v-for="item in items" :key="item.id">
        <div v-if="item.separator" class="context-menu-separator" role="separator" />
        <button
          v-else
          type="button"
          class="context-menu-item"
          :class="{danger: item.danger}"
          :disabled="item.disabled"
          :title="item.title"
          role="menuitem"
          @click="selectItem(item)"
        >
          {{ item.label }}
        </button>
      </template>
    </nav>
  </Teleport>
</template>

<script setup lang="ts">
import {computed, nextTick, onBeforeUnmount, ref, watch} from 'vue';
import type {ContextMenuItem} from './contextMenu.js';

const props = defineProps<{
  open: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
}>();

const emit = defineEmits<{
  close: [];
  select: [id: string];
}>();

const menuRef = ref<HTMLElement | null>(null);
const size = ref({width: 216, height: 48});
const viewport = ref({
  width: typeof window === 'undefined' ? 1024 : window.innerWidth,
  height: typeof window === 'undefined' ? 768 : window.innerHeight,
});

const menuStyle = computed(() => {
  const margin = 8;
  const left = Math.min(
    Math.max(margin, props.x),
    Math.max(margin, viewport.value.width - size.value.width - margin),
  );
  const top = Math.min(
    Math.max(margin, props.y),
    Math.max(margin, viewport.value.height - size.value.height - margin),
  );
  return {left: `${left}px`, top: `${top}px`};
});

function selectItem(item: ContextMenuItem) {
  if (item.disabled || item.separator) return;
  emit('select', item.id);
}

function measureMenu() {
  nextTick(() => {
    const rect = menuRef.value?.getBoundingClientRect();
    if (rect) size.value = {width: rect.width, height: rect.height};
  });
}

function onPointerDown(event: PointerEvent) {
  const target = event.target;
  if (target instanceof Node && menuRef.value?.contains(target)) return;
  emit('close');
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close');
}

function onResize() {
  viewport.value = {width: window.innerWidth, height: window.innerHeight};
  measureMenu();
}

function bindDocumentListeners() {
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('keydown', onKeydown);
  window.addEventListener('resize', onResize);
}

function unbindDocumentListeners() {
  document.removeEventListener('pointerdown', onPointerDown, true);
  document.removeEventListener('keydown', onKeydown);
  window.removeEventListener('resize', onResize);
}

watch(() => props.open, (open) => {
  if (open) {
    onResize();
    bindDocumentListeners();
  } else {
    unbindDocumentListeners();
  }
}, {immediate: true});

watch(() => [props.x, props.y, props.items.length], () => {
  if (props.open) measureMenu();
});

onBeforeUnmount(unbindDocumentListeners);
</script>

<style scoped>
.context-menu {
  position: fixed;
  z-index: 1000;
  min-width: 13.5rem;
  max-width: min(18rem, calc(100vw - 16px));
  max-height: calc(100vh - 16px);
  overflow-y: auto;
  padding: 0.25rem;
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  border-radius: 6px;
  box-shadow: 0 10px 28px rgba(0,0,0,0.45);
}

.context-menu-item {
  width: 100%;
  display: block;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #bbb;
  cursor: pointer;
  font-size: 0.85rem;
  line-height: 1.2;
  padding: 0.5rem 0.65rem;
  text-align: left;
}

.context-menu-item:hover:not(:disabled),
.context-menu-item:focus-visible:not(:disabled) {
  background: #242424;
  color: #e0e0e0;
  outline: none;
}

.context-menu-item:disabled {
  color: #666;
  cursor: default;
}

.context-menu-item.danger {
  color: #e07070;
}

.context-menu-item.danger:hover:not(:disabled),
.context-menu-item.danger:focus-visible:not(:disabled) {
  background: #2d1a1a;
  color: #f08a8a;
}

.context-menu-separator {
  height: 1px;
  margin: 0.25rem 0.35rem;
  background: #2a2a2a;
}
</style>
