import type { ComponentType, ReactNode } from 'react';
import type { ImageSourcePropType, ImageStyle, StyleProp, ViewStyle } from 'react-native';

export type ImageContentFit = 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
export type ImageCachePolicy = 'none' | 'disk' | 'memory' | 'memory-disk';

export type ImageProps = {
  source?: ImageSourcePropType | string | number | null;
  style?: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  cachePolicy?: ImageCachePolicy;
  transition?: number;
  autoplay?: boolean;
};

export const Image: ComponentType<ImageProps> & {
  prefetch?: (urls: string | string[], options?: { cachePolicy?: ImageCachePolicy }) => Promise<boolean>;
};

export const ImageBackground: ComponentType<ImageProps & { children?: ReactNode; imageStyle?: StyleProp<ImageStyle>; style?: StyleProp<ViewStyle> }>;

export function useImage(...args: unknown[]): unknown;
