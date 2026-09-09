import type { ComponentType, ReactNode } from 'react';
import type { ImageSourcePropType, ImageStyle, StyleProp, ViewStyle } from 'react-native';

export type ImageContentFit = 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
export type ImageCachePolicy = 'none' | 'disk' | 'memory' | 'memory-disk';
export type ImageRef = {
  readonly nativeRefType: 'image';
  readonly width: number;
  readonly height: number;
  readonly scale: number;
};

export type ImageProps = {
  source?: ImageSourcePropType | ImageRef | string | number | null;
  style?: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  cachePolicy?: ImageCachePolicy;
  transition?: number;
  autoplay?: boolean;
  priority?: 'low' | 'normal' | 'high';
  onDisplay?: () => void;
  onError?: (event: { error: string }) => void;
  accessible?: boolean;
};

export const Image: ComponentType<ImageProps> & {
  prefetch?: (urls: string | string[], options?: { cachePolicy?: ImageCachePolicy }) => Promise<boolean>;
};

export const ImageBackground: ComponentType<ImageProps & { children?: ReactNode; imageStyle?: StyleProp<ImageStyle>; style?: StyleProp<ViewStyle> }>;

export function useImage(source: ImageSourcePropType | string, options?: {
  maxWidth?: number;
  maxHeight?: number;
  onError?: (error: Error, retry: () => void) => void;
}, dependencies?: readonly unknown[]): ImageRef | null;
