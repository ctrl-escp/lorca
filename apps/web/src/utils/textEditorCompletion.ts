import type {Completion, CompletionContext, CompletionResult} from '@codemirror/autocomplete';

export function uniqueArtifactRefs(refs: readonly string[]): string[] {
  return [...new Set(refs.map((r) => r.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export function artifactCompletionSource(refs: readonly string[]) {
  const options: Completion[] = uniqueArtifactRefs(refs).map((artifactRef) => ({
    label: artifactRef,
    type: 'variable',
    detail: `artifact.${artifactRef}`,
  }));

  return (context: CompletionContext): CompletionResult | null => {
    const braced = context.matchBefore(/\{\{artifact\.[\w.-]*/);
    if (braced) {
      return {
        from: braced.from + '{{artifact.'.length,
        options: options.map((option) => ({...option, apply: `${option.label}}}`})),
        validFor: /^[\w.-]*$/,
      };
    }

    const bare = context.matchBefore(/artifact\.[\w.-]*/);
    if (bare) {
      return {
        from: bare.from + 'artifact.'.length,
        options,
        validFor: /^[\w.-]*$/,
      };
    }

    if (!context.explicit || options.length === 0) return null;
    return {
      from: context.pos,
      options: options.map((option) => ({
        ...option,
        label: `{{artifact.${option.label}}}`,
        apply: `{{artifact.${option.label}}}`,
      })),
    };
  };
}
