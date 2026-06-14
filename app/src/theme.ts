export const theme = {
  // base — richer, blue-tinted "arena" palette (Clash Royale vibe)
  bg: '#0C1234',
  bg2: '#17224F', // lighter blue panel for layered/gradient-ish backgrounds
  card: '#1C2A57',
  cardLip: '#0F1838', // darker bottom edge for card depth
  // ---- game-frame tokens (Clash-Royale-style panels/modals) ----
  panelInk: '#091029', // outer frame-ring base (sunken dark outline under gold rim)
  panelTopGloss: 'rgba(255,255,255,0.12)', // 1px top highlight on bevels
  panelTop: '#26376E', // top stop of hero-panel gloss gradient
  panelBot: '#16224A', // bottom stop of hero-panel gloss gradient
  panelInnerFill: '#14204A', // recessed inner well (inputs, troughs, chips)
  // accents — vibrant + glowy
  primary: '#27E58B', // vivid mint-green
  primaryDark: '#12A862', // green button "lip"/shadow
  accent: '#FFCE3A', // bright gold
  accentDark: '#CF9A12', // gold lip
  frameGold: '#FFCE3A', // ornamental hero-frame ring (= accent, named for intent)
  frameGoldDark: '#CF9A12', // hero-frame bottom bevel
  blue: '#37A8FF', // vivid blue
  blueDark: '#1E6FD4',
  purple: '#9B6BFF', // royal purple
  purpleDark: '#6A3CD6',
  danger: '#FF5468',
  dangerDark: '#CB3346',
  gold: '#FFD740',
  silver: '#CBD5E8', // rank-2 medal
  bronze: '#E08A4B', // rank-3 medal
  gemText: '#C9A6FF', // diamond count text on dark pill
  // text
  text: '#FFFFFF',
  ink: '#06131F', // dark text/icon on bright (primary/accent/gold) faces
  muted: '#98A4CE', // blue-tinted muted
  border: '#33437E', // blue-tinted border (now: inner dividers + ordinary panel rings)
  // effects
  textShadow: 'rgba(6,11,28,0.85)', // engraved text shadow under bold titles/numbers
  scrim: 'rgba(6,10,28,0.62)', // the single modal backdrop scrim
  vignetteEdge: 'rgba(6,11,28,0.55)', // full-screen radial vignette rim
  glowSoft: 'rgba(39,229,139,0.16)', // standard soft glow (ghost fill, focus halo, hints)
  stripe: '#6E8CD8', // background weave (down-right)
  stripe2: '#5A77C8', // background weave (down-left)
};

// Engraved text shadow — the cheap universal game-ifier for bold titles & numbers.
export const engrave = (size: 'lg' | 'sm' = 'lg') => ({
  textShadowColor: theme.textShadow,
  textShadowOffset: { width: 0, height: size === 'lg' ? 2 : 1 },
  textShadowRadius: size === 'lg' ? 3 : 2,
});
