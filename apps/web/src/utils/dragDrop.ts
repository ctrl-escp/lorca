/** MIME types for cross-pane HTML5 drag-and-drop. */
export const DND_STEP_ID = 'application/x-lorca-step-id';
export const DND_SUGGESTION_ID = 'application/x-lorca-suggestion-id';

/** Set on document.body while dragging a suggestion from the left pane. */
export const DND_BODY_SUGGESTION = 'lorca-dnd-suggestion';

export function readDragStepId(dt: DataTransfer | null): string | null {
  return dt?.getData(DND_STEP_ID) || null;
}

export function readDragSuggestionId(dt: DataTransfer | null): string | null {
  return dt?.getData(DND_SUGGESTION_ID) || null;
}

/** Browsers often block getData() until drop; use this during dragover. */
export function isSuggestionDragActive(): boolean {
  return document.body.classList.contains(DND_BODY_SUGGESTION);
}
