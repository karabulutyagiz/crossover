declare module 'react-native-gesture-handler/lib/commonjs/State' {
  export const State: {
    readonly UNDETERMINED: 0;
    readonly FAILED: 1;
    readonly BEGAN: 2;
    readonly CANCELLED: 3;
    readonly ACTIVE: 4;
    readonly END: 5;
  };
}

declare module 'react-native-gesture-handler/lib/commonjs/handlers/PanGestureHandler' {
  import type { ComponentType, ReactNode } from 'react';

  export const PanGestureHandler: ComponentType<{
    children?: ReactNode;
    enabled?: boolean;
    activeOffsetX?: number | [number, number];
    failOffsetY?: number | [number, number];
    onGestureEvent?: (...args: any[]) => void;
    onHandlerStateChange?: (event: { nativeEvent: { state: number; translationX: number; velocityX: number; absoluteY: number } }) => void;
  }>;
}
