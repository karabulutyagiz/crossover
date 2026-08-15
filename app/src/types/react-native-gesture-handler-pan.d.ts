import type { ComponentType, ReactNode } from 'react';

export const PanGestureHandler: ComponentType<{
  children?: ReactNode;
  enabled?: boolean;
  activeOffsetX?: number | [number, number];
  failOffsetY?: number | [number, number];
  onGestureEvent?: (...args: any[]) => void;
  onHandlerStateChange?: (event: { nativeEvent: { state: number; translationX: number; velocityX: number; absoluteY: number } }) => void;
}>;
