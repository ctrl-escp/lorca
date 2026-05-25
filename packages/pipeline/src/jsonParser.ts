export type JsonParseResult = {ok: true; value: unknown} | {ok: false};

function parseCandidate(candidate: string): JsonParseResult {
  try {
    return {ok: true, value: JSON.parse(candidate.trim())};
  } catch {
    return {ok: false};
  }
}

function* jsonCandidates(text: string): Generator<string> {
  for (let start = 0; start < text.length; start++) {
    const first = text[start];
    if (first !== '{' && first !== '[') continue;

    const stack = [first === '{' ? '}' : ']'];
    let inString = false;
    let escaped = false;

    for (let i = start + 1; i < text.length; i++) {
      const ch = text[i];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
      } else if (ch === '{') {
        stack.push('}');
      } else if (ch === '[') {
        stack.push(']');
      } else if (ch === stack[stack.length - 1]) {
        stack.pop();
        if (stack.length === 0) {
          yield text.slice(start, i + 1);
          break;
        }
      }
    }
  }
}

export function tryParseJson(text: string): JsonParseResult {
  const strict = parseCandidate(text);
  if (strict.ok) return strict;

  const fenced = text.match(/```(?:json)?\s*\n?([\s\S]+?)\n?```/i);
  if (fenced?.[1]) {
    const parsed = parseCandidate(fenced[1]);
    if (parsed.ok) return parsed;
  }

  for (const candidate of jsonCandidates(text)) {
    const parsed = parseCandidate(candidate);
    if (parsed.ok) return parsed;
  }

  return {ok: false};
}
