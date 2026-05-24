/** Format step/trace duration for display. Sub-second stays as ms; otherwise mm:ss.mss. */
export function formatDurationMs(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.floor((durationMs % 60_000) / 1000);
  const millis = durationMs % 1000;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}
