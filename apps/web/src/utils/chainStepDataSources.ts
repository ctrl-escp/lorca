import {PIPELINE_INPUT_STEP_ID, type PipelineStep} from '@lorca/core';
import {
  dataSourceBadgeTitle,
  findPreviousEnabledStepAt,
  getStepHistoryReads,
  historyReadIssueLabel,
  validateHistoryRead,
} from '@lorca/pipeline';

export type StepDataSourceKind = 'previous' | 'history' | 'template' | 'binding' | 'direct';

export interface StepDataSourceBadge {
  key: string;
  label: string;
  title: string;
  kind: StepDataSourceKind;
  invalid?: boolean;
}

export function artifactRefsInTemplate(text: string): string[] {
  const refs: string[] = [];
  const re = /\\?\{\{artifact\.([\w.-]+)\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match[0].startsWith('\\')) continue;
    refs.push(match[1]!);
  }
  return refs;
}

export function usesPreviousOutputSource(step: PipelineStep): boolean {
  if (!['model-call', 'loop-group'].includes(step.config.type)) return false;
  return step.prompt ? step.prompt.previousOutput.enabled : true;
}

export function previousInputArtifactRef(steps: readonly PipelineStep[], index: number): string {
  const previous = findPreviousEnabledStepAt([...steps], index);
  return previous ? `${previous.outputNamespace}.${previous.primaryOutputName}` : 'user_prompt.xml';
}

export function sourceLabelForArtifactRef(artifactRef: string, steps: readonly PipelineStep[]): string {
  if (artifactRef.startsWith('user_prompt.')) return 'Pipeline Input';
  const step = steps.find((s) =>
    artifactRef === `${s.outputNamespace}.${s.primaryOutputName}`
    || artifactRef.startsWith(`${s.outputNamespace}.`)
    || (s.config.type === 'capsule-instance' && Object.values(s.config.outputBindings).includes(artifactRef)),
  );
  if (step) return step.label;
  if (artifactRef === PIPELINE_INPUT_STEP_ID) return 'Pipeline Input';
  return artifactRef;
}

export function dataSourceBadges(
  step: PipelineStep,
  index: number,
  steps: readonly PipelineStep[],
): StepDataSourceBadge[] {
  const badges: StepDataSourceBadge[] = [];
  const seenRefs = new Set<string>();

  function addBadge(badge: StepDataSourceBadge, artifactRef: string) {
    const cleaned = artifactRef.trim();
    if (!cleaned || seenRefs.has(cleaned)) return;
    seenRefs.add(cleaned);
    badges.push(badge);
  }

  if (usesPreviousOutputSource(step)) {
    const prevRef = previousInputArtifactRef(steps, index);
    addBadge({
      key: `previous:${prevRef}`,
      label: sourceLabelForArtifactRef(prevRef, steps),
      title: dataSourceBadgeTitle('previous', 'Previous input', prevRef),
      kind: 'previous',
    }, prevRef);
  }

  for (const read of getStepHistoryReads(step)) {
    const validation = validateHistoryRead(read, step.id, [...steps]);
    const validationMessage = validation.ok
      ? undefined
      : validation.issues.map(historyReadIssueLabel).join(', ');
    const titleOptions = validationMessage ? {validationMessage} : undefined;
    addBadge({
      key: `history:${read.sourceArtifactRef}`,
      label: sourceLabelForArtifactRef(read.sourceArtifactRef, steps),
      title: dataSourceBadgeTitle(
        'history',
        read.required ? `Required history read <${read.tagName}>` : `Optional history read <${read.tagName}>`,
        read.sourceArtifactRef,
        titleOptions,
      ),
      kind: 'history',
      invalid: !validation.ok,
    }, read.sourceArtifactRef);
  }

  if (step.config.type === 'presentation') {
    for (const templateRef of artifactRefsInTemplate(step.config.text)) {
      addBadge({
        key: `template:${templateRef}`,
        label: sourceLabelForArtifactRef(templateRef, steps),
        title: dataSourceBadgeTitle('template', 'Template reference', templateRef),
        kind: 'template',
      }, templateRef);
    }
  }

  if (step.config.type === 'capsule-instance') {
    for (const [port, bindingRef] of Object.entries(step.config.inputBindings)) {
      addBadge({
        key: `binding:${port}:${bindingRef}`,
        label: sourceLabelForArtifactRef(bindingRef, steps),
        title: dataSourceBadgeTitle('binding', `Capsule input "${port}"`, bindingRef),
        kind: 'binding',
      }, bindingRef);
    }
  }

  return badges;
}

export function dataSourceBadgesByStepId(steps: readonly PipelineStep[]): Record<string, StepDataSourceBadge[]> {
  return Object.fromEntries(steps.map((step, index) => [step.id, dataSourceBadges(step, index, steps)]));
}
