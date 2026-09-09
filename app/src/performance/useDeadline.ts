import { useEffect, useReducer } from 'react';
import { AppState } from 'react-native';
import { deadlineSnapshot } from './deadline';

/** Only render when the displayed second changes, or once at expiry. */
export function useDeadline(deadline: number | null | undefined, precision: 'seconds' | 'expiry' = 'seconds') {
  const [, update] = useReducer((value: number) => value + 1, 0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(timer);
      const state = deadlineSnapshot(deadline, Date.now());
      const delay = precision === 'expiry' ? (state.remainingMs > 0 ? state.remainingMs + 1 : null) : state.nextSecondMs;
      if (delay !== null) timer = setTimeout(() => { update(); arm(); }, Math.min(delay, 60_000));
    };
    arm();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') { update(); arm(); }
      else clearTimeout(timer);
    });
    return () => { clearTimeout(timer); subscription.remove(); };
  }, [deadline, precision]);
  return deadlineSnapshot(deadline, Date.now()).seconds;
}
