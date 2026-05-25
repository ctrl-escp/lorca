import {CompletionContext} from '@codemirror/autocomplete';
import {EditorState} from '@codemirror/state';
import {describe, expect, it} from 'vitest';
import {artifactCompletionSource, uniqueArtifactRefs} from '../src/utils/textEditorCompletion.js';

function complete(doc: string, explicit = false) {
  const state = EditorState.create({doc});
  const context = new CompletionContext(state, doc.length, explicit);
  return artifactCompletionSource(['answer.text', ' user_prompt.raw ', 'answer.text'])(context);
}

describe('text editor artifact completion', () => {
  it('dedupes and sorts artifact refs', () => {
    expect(uniqueArtifactRefs(['b.text', ' a.raw ', 'b.text', ''])).toEqual(['a.raw', 'b.text']);
  });

  it('completes refs inside braced artifact templates', () => {
    const result = complete('Use {{artifact.ans');

    expect(result?.from).toBe('Use {{artifact.'.length);
    expect(result?.options.map((option) => option.label)).toEqual(['answer.text', 'user_prompt.raw']);
    expect(result?.options[0]?.apply).toBe('answer.text}}');
  });

  it('completes bare artifact refs without template braces', () => {
    const result = complete('artifact.user');

    expect(result?.from).toBe('artifact.'.length);
    expect(result?.options[1]?.apply).toBeUndefined();
  });

  it('offers full template snippets for explicit completion', () => {
    const result = complete('', true);

    expect(result?.from).toBe(0);
    expect(result?.options[0]?.label).toBe('{{artifact.answer.text}}');
    expect(result?.options[0]?.apply).toBe('{{artifact.answer.text}}');
  });
});
