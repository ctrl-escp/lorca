import {computed, type MaybeRefOrGetter, toValue} from 'vue';
import {buildRolePromptCatalog} from '@lorca/capsules';

export function useStepRolePromptCatalog(excludeText?: MaybeRefOrGetter<string | undefined>) {
  return computed(() => {
    const exclude = toValue(excludeText);
    return buildRolePromptCatalog(
      exclude !== undefined ? {excludeText: exclude} : undefined,
    );
  });
}
