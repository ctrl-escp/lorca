<template>
  <div
    class="pane-resize-handle"
    :class="`handle-${side}`"
    role="separator"
    aria-orientation="vertical"
    :aria-label="side === 'left' ? 'Resize left panel' : 'Resize right panel'"
    :title="side === 'left' ? 'Drag to resize the left sidebar' : 'Drag to resize the right sidebar'"
    @mousedown="onMouseDown"
  />
</template>

<script setup lang="ts">
const props = defineProps<{
  side: 'left' | 'right';
}>();

const emit = defineEmits<{
  resize: [delta: number];
}>();

function onMouseDown(e: MouseEvent) {
  e.preventDefault();
  let lastX = e.clientX;

  function onMove(ev: MouseEvent) {
    const delta = ev.clientX - lastX;
    lastX = ev.clientX;
    emit('resize', props.side === 'left' ? delta : -delta);
  }

  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}
</script>

<style scoped>
.pane-resize-handle {
  flex-shrink: 0;
  width: 5px;
  margin: 0 -2px;
  cursor: col-resize;
  position: relative;
  z-index: 2;
  transition: background 0.15s;
}
.pane-resize-handle::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 2px;
  width: 1px;
  background: #2a2a2a;
  transition: background 0.15s, width 0.15s, left 0.15s;
}
.pane-resize-handle:hover::after,
.pane-resize-handle:active::after {
  left: 1px;
  width: 3px;
  background: #3a6080;
}
</style>
