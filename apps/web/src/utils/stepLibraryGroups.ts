import type {StepType} from '@lorca/core';
import type {PipelineSuggestion} from '@lorca/capsules';

export const STEP_TYPE_ENTRIES: {type: StepType; label: string; description: string}[] = [
  {type: 'model-call', label: 'Model call', description: 'Call a model with composed prompt blocks. Set output format to JSON strict if downstream steps depend on parsed output.'},
  {type: 'loop-group', label: 'Loop', description: 'Repeat an inner step chain until exit condition'},
  {type: 'presentation', label: 'Text', description: 'Free-form text with optional {{artifact.key}} interpolation'},
];

export interface StepTypeGroup {
  type: StepType;
  label: string;
  description: string;
  suggestions: PipelineSuggestion[];
  typeMatches: boolean;
}

function matchesQuery(query: string, text: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return text.toLowerCase().includes(q);
}

export function groupSuggestionsByType(suggestions: readonly PipelineSuggestion[]): Map<StepType, PipelineSuggestion[]> {
  const map = new Map<StepType, PipelineSuggestion[]>();
  for (const s of suggestions) {
    const type = s.insertableSteps[0]?.type ?? 'model-call';
    if (!map.has(type)) map.set(type, []);
    map.get(type)!.push(s);
  }
  return map;
}

export function filterStepGroups(
  query: string,
  suggestionsByType: ReadonlyMap<StepType, PipelineSuggestion[]>,
): StepTypeGroup[] {
  const q = query.trim().toLowerCase();
  return STEP_TYPE_ENTRIES.flatMap((entry) => {
    const allSuggestions = suggestionsByType.get(entry.type) ?? [];
    if (!q) {
      return [{...entry, suggestions: allSuggestions, typeMatches: true}];
    }
    const typeMatches = matchesQuery(q, `${entry.label} ${entry.description} ${entry.type}`);
    const matchedSuggestions = allSuggestions.filter((s) =>
      matchesQuery(q, `${s.name} ${s.description} ${s.category} ${s.id}`),
    );
    if (!typeMatches && matchedSuggestions.length === 0) return [];
    return [{...entry, suggestions: typeMatches ? allSuggestions : matchedSuggestions, typeMatches}];
  });
}

export function isTypeGroupExpanded(
  type: StepType,
  query: string,
  expanded: ReadonlySet<StepType>,
  filteredGroups: readonly StepTypeGroup[],
): boolean {
  if (query.trim()) {
    const group = filteredGroups.find((g) => g.type === type);
    if (group && !group.typeMatches && group.suggestions.length > 0) return true;
  }
  return expanded.has(type);
}
