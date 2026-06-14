export const theme = {
  // base — dark forest-green "field" palette (harmonizes with the green field background image)
  bg: '#0B1A11',
  bg2: '#16331F', // lighter green panel for layered/gradient-ish backgrounds
  card: '#173A23',
  cardLip: '#0C2113', // darker bottom edge for card depth
  // ---- game-frame tokens (Clash-Royale-style panels/modals) ----
  panelInk: '#07140B', // outer frame-ring base (sunken dark outline under gold rim)
  panelTopGloss: 'rgba(255,255,255,0.12)', // 1px top highlight on bevels
  panelTop: '#214E2F', // top stop of hero-panel gloss gradient
  panelBot: '#12301C', // bottom stop of hero-panel gloss gradient
  panelInnerFill: '#102A18', // recessed inner well (inputs, troughs, chips)
  // accents — vibrant + glowy (pop on dark-green panels & green field)
  primary: '#2BE38C', // vivid mint-green
  primaryDark: '#13A861', // green button "lip"/shadow
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
  ink: '#06140A', // dark text/icon on bright (primary/accent/gold) faces
  muted: '#9FBE9B', // green-tinted muted
  border: '#2E5A39', // green-tinted border (inner dividers + ordinary panel rings)
  // effects
  textShadow: 'rgba(4,15,8,0.85)', // engraved text shadow under bold titles/numbers
  scrim: 'rgba(5,15,8,0.64)', // the single modal backdrop scrim
  vignetteEdge: 'rgba(5,14,8,0.55)', // full-screen radial vignette rim
  glowSoft: 'rgba(43,227,140,0.16)', // standard soft glow (ghost fill, focus halo, hints)
  stripe: '#5C9E55', // background weave (down-right)
  stripe2: '#4E8A48', // background weave (down-left)
};

// Engraved text shadow — the cheap universal game-ifier for bold titles & numbers.
export const engrave = (size: 'lg' | 'sm' = 'lg') => ({
  textShadowColor: theme.textShadow,
  textShadowOffset: { width: 0, height: size === 'lg' ? 2 : 1 },
  textShadowRadius: size === 'lg' ? 3 : 2,
});
