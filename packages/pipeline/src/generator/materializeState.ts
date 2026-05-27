import type {PipelineDefinition, PipelineStep} from '@lorca/core';
import type {
  GeneratorBuildContext,
  GeneratorModelAssignmentRequest,
} from './types.js';
import {resolveGeneratorRefToArtifactKey, uniqueNamespace} from './refResolve.js';

export interface StepKeyBinding {
  stepId: string;
  outputNamespace: string;
  primaryOutputName: string;
}

export class MaterializeState {
  readonly namespaces = new Set<string>();
  stepKeyMap = new Map<string, StepKeyBinding>();
  readonly steps: PipelineStep[] = [];
  readonly modelRequests: GeneratorModelAssignmentRequest[] = [];
  private firstModelCallSlot = true;

  constructor(
    readonly context: GeneratorBuildContext,
    existingPipeline?: PipelineDefinition,
  ) {
    if (existingPipeline) {
      this.namespaces.add(existingPipeline.input.outputNamespace);
      for (const step of existingPipeline.steps) {
        this.collectNamespaces(step);
      }
    }
  }

  private collectNamespaces(step: PipelineStep): void {
    this.namespaces.add(step.outputNamespace);
    if (step.config.type === 'loop-group') {
      for (const inner of step.config.steps) this.collectNamespaces(inner);
    }
    if (step.config.type === 'capsule-instance') {
      for (const inner of step.config.inlineSteps ?? []) this.collectNamespaces(inner);
    }
  }

  /** Loop body builder — shares stepKey map and namespaces; does not consume first-model-call slot. */
  childForLoopBody(): MaterializeState {
    const child = new MaterializeState(this.context, this.context.existingPipeline);
    child.namespaces.clear();
    for (const ns of this.namespaces) child.namespaces.add(ns);
    child.stepKeyMap = this.stepKeyMap;
    child.firstModelCallSlot = false;
    return child;
  }

  absorbNamespacesFrom(steps: readonly PipelineStep[]): void {
    for (const step of steps) this.collectNamespaces(step);
  }

  consumeFirstModelCallSlot(): boolean {
    if (!this.firstModelCallSlot) return false;
    this.firstModelCallSlot = false;
    return true;
  }

  registerStepKey(stepKey: string, step: PipelineStep): void {
    this.stepKeyMap.set(stepKey, {
      stepId: step.id,
      outputNamespace: step.outputNamespace,
      primaryOutputName: step.primaryOutputName,
    });
  }

  namespaceForStepKey(stepKey: string): string {
    const safe = stepKey.replace(/[^a-zA-Z0-9_]/g, '_') || 'step';
    return uniqueNamespace(safe, this.namespaces);
  }

  resolveArtifactKey(ref: string, currentStepKey: string): string | null {
    return resolveGeneratorRefToArtifactKey(
      ref,
      this.stepKeyMap,
      this.context.existingPipeline,
      currentStepKey,
    );
  }
}
