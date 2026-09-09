import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing } from 'react-native';

/** One native timeline shared by home chrome, navbar and search controls. */
export function useSearchTransition(searching: boolean) {
  const progress = useRef(new Animated.Value(searching ? 1 : 0)).current;
  const target = useRef(searching);
  const animating = useRef(false);
  const [transitioning, setTransitioning] = useState(false);
  const [reduced, setReduced] = useState(true);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (alive) setReduced(value); }).catch(() => {});
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    const app = AppState.addEventListener('change', (value) => setForeground(value === 'active'));
    return () => { alive = false; motion.remove(); app.remove(); };
  }, []);
  useEffect(() => {
    if (target.current === searching && !animating.current) return;
    target.current = searching;
    animating.current = true;
    setTransitioning(true);
    // A new target interrupts from the current presentation value, never snaps
    // to 0/1. Cancel need not wait for the entry animation to finish.
    const animation = Animated.timing(progress, {
      toValue: searching ? 1 : 0, duration: reduced || !foreground ? 0 : searching ? 420 : 340,
      easing: Easing.out(Easing.cubic), useNativeDriver: true, isInteraction: false,
    });
    animation.start(({ finished }) => {
      if (!finished) return;
      animating.current = false;
      setTransitioning(false);
    });
    return () => animation.stop();
  }, [searching, reduced, foreground, progress]);
  return { progress, locked: searching || transitioning, moving: searching && foreground && !reduced };
}
