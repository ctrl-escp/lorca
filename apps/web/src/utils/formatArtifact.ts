/** Format artifact values for display; pretty-print JSON when parseable. */
export function formatArtifactDisplay(value: unknown, maxLen?: number): string {
  let text: string;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        text = JSON.stringify(JSON.parse(trimmed), null, 2);
      } catch {
        text = value;
      }
    } else {
      text = value;
    }
  } else {
    text = JSON.stringify(value, null, 2);
  }
  if (maxLen !== undefined && text.length > maxLen) {
    return `${text.slice(0, maxLen)}\n… (truncated)`;
  }
  return text;
}

export function tryParseJsonValue(value: unknown): unknown | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}
