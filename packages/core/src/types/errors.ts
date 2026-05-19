export type PipelineErrorCode =
  | 'invalid_pipeline_graph'
  | 'cycle_detected'
  | 'duplicate_artifact_key'
  | 'missing_artifact'
  | 'missing_endpoint'
  | 'missing_model'
  | 'endpoint_browser_access_blocked'
  | 'endpoint_unreachable'
  | 'model_call_failed'
  | 'template_render_failed'
  | 'json_parse_failed'
  | 'missing_capsule'
  | 'missing_capsule_version'
  | 'invalid_capsule_interface'
  | 'capsule_loop_limit_exceeded'
  | 'capsule_iteration_failed'
  | 'final_output_missing'
  | 'run_cancelled'
  | 'unknown_error';

export interface PipelineError {
  code: PipelineErrorCode;
  message: string;
  nodeId?: string;
  capsuleInstanceId?: string;
  iteration?: number;
}

export type Result<T, E = PipelineError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return {ok: true, value};
}

export function err<E>(error: E): Result<never, E> {
  return {ok: false, error};
}
