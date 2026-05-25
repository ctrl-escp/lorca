import {ref} from 'vue';
import type {ContextMenuItem} from '../components/shared/contextMenu.js';

export function useLeftPaneContextMenu() {
  const menu = ref<{
    x: number;
    y: number;
    items: ContextMenuItem[];
    actions: Record<string, () => void>;
  } | null>(null);

  function open(
    event: MouseEvent,
    items: ContextMenuItem[],
    actions: Record<string, () => void>,
  ) {
    menu.value = {x: event.clientX, y: event.clientY, items, actions};
  }

  function close() {
    menu.value = null;
  }

  function select(action: string) {
    const handler = menu.value?.actions[action];
    close();
    handler?.();
  }

  return {menu, open, close, select};
}
