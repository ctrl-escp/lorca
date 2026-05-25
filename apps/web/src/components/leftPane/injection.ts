import type {InjectionKey} from 'vue';
import type {useLeftPaneContextMenu} from '../../composables/useLeftPaneContextMenu.js';

export type LeftPaneContextMenu = ReturnType<typeof useLeftPaneContextMenu>;
export const LEFT_PANE_CONTEXT_MENU_KEY: InjectionKey<LeftPaneContextMenu> = Symbol('leftPaneContextMenu');

export type SuggestionReplaceConfirm = (name: string) => Promise<boolean>;
export const SUGGESTION_REPLACE_KEY: InjectionKey<SuggestionReplaceConfirm> = Symbol('suggestionReplace');
