import { Keyboard, TextInput } from 'react-native';

type FocusableNativeInput = { blur?: () => void };
type TextInputStateShape = {
  currentlyFocusedInput?: () => FocusableNativeInput | null;
  currentlyFocusedField?: () => number | null;
  blurTextInput?: (field: number | null) => void;
};

function textInputState(): TextInputStateShape | undefined {
  return (TextInput as unknown as { State?: TextInputStateShape }).State;
}

export function dismissActiveInput(): void {
  const state = textInputState();
  try {
    const focusedInput = state?.currentlyFocusedInput?.();
    if (focusedInput && typeof focusedInput.blur === 'function') {
      focusedInput.blur();
    } else {
      const focusedField = state?.currentlyFocusedField?.();
      if (focusedField != null) state?.blurTextInput?.(focusedField);
    }
  } catch {
    // The focused native view can disappear during navigation; Keyboard.dismiss is still safe.
  }
  Keyboard.dismiss();
}
