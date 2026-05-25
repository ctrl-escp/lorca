import {ref} from 'vue';

export type ConfirmState = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  destructive: boolean;
};

export type PromptState = {
  open: boolean;
  title: string;
  label: string;
  defaultValue: string;
};

export function useModalDialogs() {
  const confirmState = ref<ConfirmState>({
    open: false,
    title: '',
    message: '',
    confirmLabel: 'OK',
    destructive: false,
  });
  let confirmResolve: ((v: boolean) => void) | null = null;

  function showConfirm(opts: {
    title: string;
    message: string;
    confirmLabel?: string;
    destructive?: boolean;
  }): Promise<boolean> {
    return new Promise((resolve) => {
      confirmResolve = resolve;
      confirmState.value = {
        open: true,
        title: opts.title,
        message: opts.message,
        confirmLabel: opts.confirmLabel ?? 'OK',
        destructive: opts.destructive ?? false,
      };
    });
  }

  function resolveConfirm(value: boolean) {
    confirmState.value = {...confirmState.value, open: false};
    confirmResolve?.(value);
    confirmResolve = null;
  }

  const promptState = ref<PromptState>({open: false, title: '', label: '', defaultValue: ''});
  let promptResolve: ((v: string | null) => void) | null = null;

  function showPrompt(opts: {
    title: string;
    label: string;
    defaultValue?: string;
  }): Promise<string | null> {
    return new Promise((resolve) => {
      promptResolve = resolve;
      promptState.value = {
        open: true,
        title: opts.title,
        label: opts.label,
        defaultValue: opts.defaultValue ?? '',
      };
    });
  }

  function resolvePrompt(value: string | null) {
    promptState.value = {...promptState.value, open: false};
    promptResolve?.(value);
    promptResolve = null;
  }

  return {
    confirmState,
    promptState,
    showConfirm,
    resolveConfirm,
    showPrompt,
    resolvePrompt,
  };
}
