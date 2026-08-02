export const theme = {
  // base — navy/royal-blue "arena" palette (harmonizes with the blue arena backdrop backgrounds)
  bg: '#0B1838', // flat solid used for match screens (no patterned bg there)
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
  // Green sampled from the cof-yeni-home mockup's "Hemen Oyna" CTA face (#13AB7A
  // dominant, 18% of the button's pixels). Deeper//less minty than the old #27E58B —
  // it is the app's single green, so every tab moves with it.
  primary: '#16B27A', // mockup emerald
  primaryDark: '#0B7A55', // green button "lip"/shadow
  accent: '#FFCE3A', // bright gold
  accentDark: '#CF9A12', // gold lip
  frameGold: '#FFCE3A', // ornamental hero-frame ring (= accent, named for intent)
  frameGoldDark: '#CF9A12', // hero-frame bottom bevel
  blue: '#37A8FF', // vivid blue
  blueDark: '#1E6FD4',
  purple: '#9B6BFF', // royal purple
  purpleDark: '#6A3CD6',
  gem: '#A855F7', // premium-currency crystal (GemIcon re-exports this as GEM_COLOR)
  gemDark: '#6F38A3', // gem lip/bevel (gem darkened 0.34)
  flame: '#FF7A45', // top arena tier (GOAT) ramp color
  flameDark: '#C0431C', // flame lip/bevel (flame darkened)
  danger: '#FF5468',
  dangerDark: '#CB3346',
  gold: '#FFD740',
  silver: '#CBD5E8', // rank-2 medal
  bronze: '#E08A4B', // rank-3 medal
  gemText: '#C9A6FF', // diamond count text on dark pill
  // text
  text: '#FFFFFF',
  ink: '#06131F', // dark text/icon on bright (primary/accent/gold) faces
  muted: '#8A97C6', // blue-tinted muted (Broadcast Prestige: slightly deeper = more corporate)
  border: '#33437E', // blue-tinted border — NOW restricted to disabled 1px only (no static rings)
  // ---- cof-yeni-home mockup tokens (sampled from the reference JPEG) ----
  navyChip: '#1D375C', // raised circular icon buttons in the top bar (lighter than card)
  navyWell: '#101C3C', // sunken troughs: xp bar, search input, stepper minus
  tabBar: '#142046', // bottom tab bar body
  amber: '#D08528', // "Mücadele Modu" photo card face
  amberDeep: '#5E4220', // its dark caption band along the bottom
  clubYellow: '#DEAF3B', // club-crest / arena card face
  coin: '#E99719', // gold coin (currency pill)
  badgeRed: '#EE362E', // notification dots + tab count badges
  // effects
  textShadow: 'rgba(5,11,31,0.5)', // engrave shadow — lightened (Broadcast Prestige: only h1 + display numerals)
  scrim: 'rgba(6,10,26,0.68)', // the single modal backdrop scrim (flat, no blur)
  vignetteEdge: 'rgba(6,11,28,0.55)', // full-screen radial vignette rim
  glowSoft: 'rgba(22,178,122,0.16)', // soft glow — USE RESTRICTED to win-moment only (no focus halos)
  stripe: '#6E8CD8', // background weave (down-right)
  stripe2: '#5A77C8', // background weave (down-left)

  // ═══ BROADCAST PRESTIGE (2026-07-30) — depth WITHOUT dark ink borders ═══
  // Surface ladder: each layer 1 step lighter than what's under it. Depth reads
  // from tone difference, never from a drawn border.
  surface0: '#0B1838', // = bg  (screen ground)
  surface1: '#17224F', // = bg2 (base panel, tab bar)
  surface2: '#1C2A57', // = card (standard card/row/chip)
  surface3: '#24356B', // NEW  (hero / selected / active surface)
  well: '#101C3C',     // = navyWell (input/trough — sunken, darkest)
  modalFace: '#1E2A58', // NEW (modal body)
  // borderless depth primitives (replace the dark frame)
  topLight: 'rgba(255,255,255,0.08)',       // 1px top photon on any raised surface
  topLightStrong: 'rgba(255,255,255,0.16)', // buttons / active surfaces
  hairline: 'rgba(255,255,255,0.07)',       // internal divider (NOT a border)
  hairlineDark: 'rgba(5,11,31,0.55)',       // recessed top-shadow (well)
  edgeInk: 'rgba(5,11,31,0.45)',            // integrated bottom slice (not a separate frame)
  // dark-on-bright text (prestige "dark on face")
  onPrimary: '#06231A',
  onAccent: '#1A1206',
  onBlue: '#052236',
  onPurple: '#1B0A38',
  onFlame: '#2B0C02',
  textSub: '#C3CCEC',
  // shadow inks (NEVER #000)
  shadowInk: '#050B1F',
  shadowModalInk: '#02060F',
  // state (focus / selected only — not static decor)
  focusBar: '#16B27A', // = primary (input left tick + caret)
  selectWash: 'rgba(22,178,122,0.10)', // selected-row inner wash
};

// ── Depth shadow presets (Broadcast Prestige) — navy ink, never pure black ──
export const shadowSoft = { shadowColor: '#050B1F', shadowOpacity: 0.28, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 5 } as const;   // panel/card
export const shadowRow = { shadowColor: '#050B1F', shadowOpacity: 0.22, shadowRadius: 7, shadowOffset: { width: 0, height: 4 }, elevation: 4 } as const;     // row/chip
export const shadowRaised = { shadowColor: '#050B1F', shadowOpacity: 0.34, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 9 } as const; // hero
export const shadowModal = { shadowColor: '#02060F', shadowOpacity: 0.45, shadowRadius: 28, shadowOffset: { width: 0, height: 16 }, elevation: 20 } as const;
export const shadowTabBar = { shadowColor: '#02060F', shadowOpacity: 0.34, shadowRadius: 16, shadowOffset: { width: 0, height: -4 }, elevation: 10 } as const; // casts upward

// Engraved text shadow — the cheap universal game-ifier for bold titles & numbers.
export const engrave = (size: 'lg' | 'sm' = 'lg') => ({
  textShadowColor: theme.textShadow,
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: size === 'lg' ? 2 : 1,
});
