import type {GeneratorPlanEntry} from './types.js';

export interface CountPlanEntriesOptions {
  recursive?: boolean;
}

/** Count plan entries; with `recursive: true`, includes nested loop bodies. */
export function countPlanEntries(
  entries: readonly GeneratorPlanEntry[],
  options: CountPlanEntriesOptions = {},
): number {
  const recursive = options.recursive ?? false;
  let count = 0;
  for (const entry of entries) {
    count++;
    if (recursive && entry.kind === 'loop') {
      count += countPlanEntries(entry.steps, options);
    }
  }
  return count;
}
