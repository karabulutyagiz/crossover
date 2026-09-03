// COF UI Foundation — tek giriş noktası. Ekranlar `../cof` üzerinden alır.
export { cof, cofTokens, cofColor, cofSpacing, cofRadius, cofBorder, cofSize, cofMotion, cofType, cofTypeStyle, cofTypeIsUppercase, cofElevation, cofFontFamily, cofScrollBottomPadding, COF_FONT_FILES, COF_LIP_COLOR, COF_MIN_FIT_SCALE, LABEL_MIN_FIT_SCALE, labelFitPolicy } from './theme';
export type { CofTokens, CofTypeVariant, CofElevation, CofFontWeight } from './theme';
export { contrastRatio, relativeLuminance, parseHex } from './contrast';
export { buttonForeground, buttonForegroundDetail, badgeForeground, badgeForegroundDetail, resolveColorToken, BUTTON_SURFACE, BADGE_SURFACE, CONTROL_BORDER_COLOR, DIGIT_CELL_RATIO, NUMBER_BEHAVIOR } from './policy';
export type { CofButtonVariant, CofButtonSize, CofBadgeVariant } from './policy';
export { formatNumber, formatDate, cofUpper } from './format';
export { CofText, CofSurface, CofCard, CofButton, CofSectionHeader, CofSegmentedTabs, CofBadge, CofNumber, useCofReducedMotion } from './primitives';
export type { CofTextTone, CofSurfaceVariant } from './primitives';
