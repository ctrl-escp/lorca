// Escape user text for embedding in XML-like prompt envelopes.
// This is not a strict XML serializer — it uses a predictable delimiter format.
export function escapePromptText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function unescapePromptText(text: string): string {
  return text
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}
