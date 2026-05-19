import {toRaw} from 'vue';

/** Strip Vue reactivity before writing to IndexedDB. */
export function cloneForStorage<T>(value: T): T {
  return JSON.parse(JSON.stringify(toRaw(value))) as T;
}
