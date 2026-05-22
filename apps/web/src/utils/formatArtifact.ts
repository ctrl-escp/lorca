const JSON_FENCE_RE = /^```[ \t]*json[^\n\r]*\r?\n([\s\S]*?)\r?\n?```[ \t]*$/i;

/** Format artifact values for display; pretty-print JSON when parseable. */
export function formatArtifactDisplay(value: unknown, maxLen?: number): string {
  let text: string;
  if (typeof value === 'string') {
    const jsonText = jsonTextFromString(value);
    if (jsonText !== null) {
      try {
        text = JSON.stringify(JSON.parse(jsonText), null, 2);
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
  const jsonText = jsonTextFromString(value);
  if (jsonText === null) return null;
  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

function jsonTextFromString(value: string): string | null {
  const trimmed = value.trim();
  const fenced = JSON_FENCE_RE.exec(trimmed);
  if (fenced?.[1] !== undefined) return fenced[1].trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return value;
  return null;
}
