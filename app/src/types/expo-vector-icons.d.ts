import type { ComponentType } from 'react';
import type { StyleProp, TextStyle } from 'react-native';

export type IconProps = {
  name: string;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
};

export const Ionicons: ComponentType<IconProps>;
