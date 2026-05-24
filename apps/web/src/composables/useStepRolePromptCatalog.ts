import {computed, type MaybeRefOrGetter, toValue} from 'vue';
import {getStepRolePromptCatalog} from '../utils/stepRolePromptCatalog.js';

export function useStepRolePromptCatalog(excludeText?: MaybeRefOrGetter<string | undefined>) {
  return computed(() => {
    const exclude = toValue(excludeText);
    return getStepRolePromptCatalog(
      exclude !== undefined ? {excludeText: exclude} : undefined,
    );
  });
}
