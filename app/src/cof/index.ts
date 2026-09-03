// COF UI Foundation — tek giriş noktası. Ekranlar `../cof` üzerinden alır.
export { cof, cofTokens, cofColor, cofSpacing, cofRadius, cofBorder, cofSize, cofMotion, cofType, cofTypeStyle, cofTypeIsUppercase, cofElevation, cofFontFamily, cofScrollBottomPadding, COF_FONT_FILES, COF_LIP_COLOR, COF_MIN_FIT_SCALE, LABEL_MIN_FIT_SCALE, labelFitPolicy } from './theme';
export type { CofTokens, CofTypeVariant, CofElevation, CofFontWeight } from './theme';
export { contrastRatio, relativeLuminance, parseHex } from './contrast';
export { buttonForeground, buttonForegroundDetail, badgeForeground, badgeForegroundDetail, resolveColorToken, cofInputAppearance, cofTabAppearance, touchSlopFor, BUTTON_SURFACE, BADGE_SURFACE, CONTROL_BORDER_COLOR, COF_INPUT_HEIGHT, DIGIT_CELL_RATIO, MIN_TOUCH, NUMBER_BEHAVIOR } from './policy';
export type { CofButtonVariant, CofButtonSize, CofBadgeVariant, CofInputState, CofTabState } from './policy';
export { cofRootContentInset, cofDetailContentInset, cofNavTotalHeight, cofRootRestingSpace, cofDetailRestingSpace, screenBottomPadding, cofNavAppearance, cofNavStates, isCofDetailPhase, isCofNavHidden, LEGACY_SCREEN_BOTTOM_PAD, COF_NAV_ORDER } from './navPolicy';
export { formatNumber, formatDate, cofUpper } from './format';
export { CofText, CofSurface, CofCard, CofButton, CofSectionHeader, CofSegmentedTabs, CofBadge, CofNumber, CofInput, CofIconButton, useCofReducedMotion } from './primitives';
export type { CofTextTone, CofSurfaceVariant } from './primitives';
export { RootScreenShell, DetailScreenShell, CofBottomNav, useCofContentInset, useCofContentInsetValue, useCofInShell, useCofKeyboardVisible } from './shell';
export type { CofNavItem } from './shell';
