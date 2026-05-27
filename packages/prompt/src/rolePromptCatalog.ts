export type StepRolePromptSource = 'suggestion' | 'example';

export interface StepRolePromptTemplate {
  id: string;
  role: string;
  category: string;
  source: StepRolePromptSource;
  text: string;
}

function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

export function dedupeStepRolePromptTemplates(
  entries: readonly StepRolePromptTemplate[],
): StepRolePromptTemplate[] {
  const seen = new Map<string, StepRolePromptTemplate>();
  for (const entry of entries) {
    const key = normalizeText(entry.text);
    if (!key || seen.has(key)) continue;
    seen.set(key, {...entry, id: `role-${hashText(key)}`});
  }
  return [...seen.values()].sort(
    (a, b) => a.category.localeCompare(b.category) || a.role.localeCompare(b.role),
  );
}

function hashText(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h) ^ text.charCodeAt(i);
  return (h >>> 0).toString(36);
}

export function truncatePromptPreview(text: string, maxLen = 120): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= maxLen) return oneLine;
  return `${oneLine.slice(0, maxLen - 1)}…`;
}
