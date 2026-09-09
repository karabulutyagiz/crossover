import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';

let reduceMotion = true;
// Warm the preference in the menu shell, not on the critical tap-to-open path.
export function useMenuMotionPreference() {
  useEffect(() => {
    let alive = true;
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', value => { reduceMotion = value; });
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (alive) reduceMotion = value; }).catch(() => {});
    return () => { alive = false; sub.remove(); };
  }, []);
}

export function useMenuMotion(onClose: () => void, presentation: 'dialog' | 'page' = 'dialog', visible = true) {
  const progress = useRef(new Animated.Value(0)).current;
  const closing = useRef(false);
  const callback = useRef(onClose);
  callback.current = onClose;
  const reduced = reduceMotion;
  useLayoutEffect(() => {
    closing.current = false;
    progress.setValue(0);
    if (!visible) return;
    Animated.timing(progress, { toValue: 1, duration: reduced ? 0 : presentation === 'page' ? 340 : 240, easing: presentation === 'page' ? Easing.bezier(.22, .61, .36, 1) : Easing.out(Easing.cubic), useNativeDriver: true }).start();
    return () => progress.stopAnimation();
  }, [progress, reduced, presentation, visible]);
  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    Animated.timing(progress, { toValue: 0, duration: reduced ? 0 : presentation === 'page' ? 260 : 160, easing: Easing.inOut(Easing.quad), useNativeDriver: true }).start(({ finished }) => {
      if (finished) callback.current();
    });
  }, [progress, reduced, presentation]);
  return { progress, close, reduced };
}

export function useButtonMotion() {
  const press = useRef(new Animated.Value(0)).current;
  useEffect(() => () => press.stopAnimation(), [press]);
  const pressIn = useCallback(() => {
    Animated.timing(press, { toValue: 1, duration: reduceMotion ? 0 : 65, useNativeDriver: true }).start();
  }, [press]);
  const pressOut = useCallback(() => {
    Animated.timing(press, { toValue: 0, duration: reduceMotion ? 0 : 110, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [press]);
  return { press, pressIn, pressOut };
}
