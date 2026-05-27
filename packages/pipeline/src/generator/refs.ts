/** Parsed canonical generator artifact reference. */
export type GeneratorArtifactRef =
  | {scope: 'generated'; stepKey: string; output: string}
  | {scope: 'current'; namespace: string; output: string};

const GENERATED_REF = /^generated:([a-zA-Z0-9_-]+)\.([a-zA-Z0-9_-]+)$/;
const CURRENT_REF = /^current:([a-zA-Z0-9_-]+)\.([a-zA-Z0-9_-]+)$/;

export function parseGeneratorArtifactRef(ref: string): GeneratorArtifactRef | null {
  const trimmed = ref.trim();
  const generated = GENERATED_REF.exec(trimmed);
  if (generated) {
    return {scope: 'generated', stepKey: generated[1]!, output: generated[2]!};
  }
  const current = CURRENT_REF.exec(trimmed);
  if (current) {
    return {scope: 'current', namespace: current[1]!, output: current[2]!};
  }
  return null;
}

export function formatGeneratorArtifactRef(ref: GeneratorArtifactRef): string {
  if (ref.scope === 'generated') return `generated:${ref.stepKey}.${ref.output}`;
  return `current:${ref.namespace}.${ref.output}`;
}

export function isGeneratorArtifactRefString(value: unknown): value is string {
  return typeof value === 'string' && parseGeneratorArtifactRef(value) !== null;
}
