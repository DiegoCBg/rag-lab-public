// ===================================================================
// Design System Tokens — Light & Dark (Apple Glass + Fluent Acrylic)
// ===================================================================
// Objetos JS espelhados das CSS custom properties em tokens.css.
// Usado por: theme.ts, store/theme.ts e documentação.

export const lightTokens = {
  // Tema
  colorScheme: 'light',
  gapStandard: 18,     // px
  cardPadding: 22,     // px

  // Fondos e Vidro
  bg: '#f8fafc',
  surface: 'rgba(255, 255, 255, 0.75)',
  surface2: 'rgba(241, 245, 249, 0.8)',
  surfaceHover: 'rgba(255, 255, 255, 0.95)',
  containerBackground: 'rgba(255, 255, 255, 0.72)',
  glassBlur: 'blur(20px) saturate(180%)',
  glassBorder: 'rgba(255, 255, 255, 0.6)',

  // Bordas
  borderSoft: 'rgba(226, 232, 240, 0.8)',
  borderStrong: '#cbd5e1',
  borderFocus: 'rgba(99, 102, 241, 0.4)',

  // Textos
  text: '#0f172a',
  textSecondary: '#475569',
  muted: '#64748b',

  // Accent (Indigo Apple / Vibrant Fluent Blue)
  accent: '#6366f1',
  accentHover: 'rgba(80, 82, 200, 0.85)',
  accentGradient: 'linear-gradient(135deg, #6366f1 0%, rgba(80, 82, 200, 0.85) 100%)',
  accentSoft: 'rgba(99, 102, 241, 0.12)',
  accentBorder: 'rgba(99, 102, 241, 0.28)',

  // Estados
  success: '#10b981',
  successSoft: 'rgba(16, 185, 129, 0.1)',
  successBorder: 'rgba(16, 185, 129, 0.3)',
  error: '#ef4444',
  errorSoft: 'rgba(239, 68, 68, 0.1)',
  errorBorder: 'rgba(239, 68, 68, 0.24)',
  warning: '#f59e0b',
  warningSoft: 'rgba(245, 158, 11, 0.1)',
  warningBorder: 'rgba(245, 158, 11, 0.28)',
  infoBorder: 'rgba(56, 189, 248, 0.45)',
  codeBg: '#0f172a',
  codeText: '#f8fafc',
  onAccent: '#ffffff',
  diffAddedBg: 'rgba(16, 185, 129, 0.16)',
  diffRemovedBg: 'rgba(239, 68, 68, 0.16)',

  // Raio de cantos
  controlHeight: 44,    // px
  rowHeight: 46,        // px
  controlRadius: 10,    // px (controles)
  panelRadius: 16,      // px (painéis/cards)
  radiusXl: 24,         // px (extra-large)

  // Elevação e Sombras
  shadowLift: '0 4px 20px -2px rgba(15, 23, 42, 0.05), 0 2px 6px -1px rgba(15, 23, 42, 0.03)',
  shadowLiftHover: '0 12px 32px -4px rgba(99, 102, 241, 0.12), 0 4px 12px -2px rgba(15, 23, 42, 0.06)',
  cardShadow: '0 1px 3px rgba(15, 23, 42, 0.04), 0 1px 2px rgba(15, 23, 42, 0.02)',
  cardShadowMd: '0 10px 25px -5px rgba(99, 102, 241, 0.08), 0 8px 10px -6px rgba(15, 23, 42, 0.04)',
  elevation1: '0 4px 12px rgba(15, 23, 42, 0.05)',
  elevation2: '0 8px 24px rgba(99, 102, 241, 0.1)',
  elevation3: '0 16px 36px rgba(99, 102, 241, 0.14)',
  glowAccent: '0 0 24px rgba(99, 102, 241, 0.25)',

  // Paper & Divider
  paper: '#fafafa',
  divider: '#e7e7ea',

  // Z-index
  zLoginPhoto: 2,
  zLoginCard: 3,
  zSidebar: 10,
  zBrandAsset: 20,

  // Focus & Transitions
  focusRing: '0 0 0 3px rgba(99, 102, 241, 0.35)',
  transitionFast: '120ms ease-out',
  transitionStandard: '200ms ease-in-out',

  // Spacing (base 4px)
  space1: 4,
  space2: 8,
  space3: 12,
  space4: 16,
  space5: 20,
  space6: 24,
  space8: 32,
  space10: 40,

  // Blur strength
  blurStrength: 16,     // px

  // Surface opacity
  surfaceOpacity: 0.75,
}

export const darkTokens = {
  colorScheme: 'dark',
  gapStandard: 18,
  cardPadding: 22,

  bg: '#0b0d12',
  surface: 'rgba(17, 20, 28, 0.85)',
  surface2: 'rgba(28, 32, 42, 0.9)',
  surfaceHover: 'rgba(31, 35, 46, 0.98)',
  containerBackground: 'rgba(17, 20, 28, 0.82)',
  glassBlur: 'blur(20px) saturate(160%)',
  glassBorder: 'rgba(255, 255, 255, 0.08)',

  borderSoft: 'rgba(148, 163, 184, 0.18)',
  borderStrong: 'rgba(148, 163, 184, 0.34)',
  borderFocus: 'rgba(129, 140, 248, 0.55)',

  text: '#e7e9ee',
  textSecondary: '#9aa1ad',
  muted: '#6b7280',

  accent: '#818cf8',
  accentHover: 'rgba(135, 142, 210, 0.85)',
  accentGradient: 'linear-gradient(135deg, #818cf8 0%, rgba(135, 142, 210, 0.85) 100%)',
  accentSoft: 'rgba(129, 140, 248, 0.12)',
  accentBorder: 'rgba(129, 140, 248, 0.32)',

  success: '#34d399',
  successSoft: 'rgba(52, 211, 153, 0.12)',
  successBorder: 'rgba(52, 211, 153, 0.34)',
  error: '#f87171',
  errorSoft: 'rgba(248, 113, 113, 0.12)',
  errorBorder: 'rgba(248, 113, 113, 0.3)',
  warning: '#fbbf24',
  warningSoft: 'rgba(251, 191, 36, 0.12)',
  warningBorder: 'rgba(251, 191, 36, 0.32)',
  infoBorder: 'rgba(56, 189, 248, 0.5)',
  codeBg: '#0f172a',
  codeText: '#f8fafc',
  onAccent: '#ffffff',
  diffAddedBg: 'rgba(52, 211, 153, 0.16)',
  diffRemovedBg: 'rgba(248, 113, 113, 0.16)',

  controlHeight: 44,
  rowHeight: 46,
  controlRadius: 10,
  panelRadius: 16,
  radiusXl: 24,

  shadowLift: '0 4px 20px -2px rgba(0, 0, 0, 0.5), 0 2px 6px -1px rgba(0, 0, 0, 0.4)',
  shadowLiftHover: '0 12px 32px -4px rgba(129, 140, 248, 0.2), 0 4px 12px -2px rgba(0, 0, 0, 0.5)',
  cardShadow: '0 1px 3px rgba(0, 0, 0, 0.4), 0 1px 2px rgba(0, 0, 0, 0.25)',
  cardShadowMd: '0 10px 25px -5px rgba(129, 140, 248, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.4)',
  elevation1: '0 4px 12px rgba(0, 0, 0, 0.4)',
  elevation2: '0 8px 24px rgba(129, 140, 248, 0.18)',
  elevation3: '0 16px 36px rgba(129, 140, 248, 0.25)',
  glowAccent: '0 0 24px rgba(129, 140, 248, 0.3)',

  paper: '#11141c',
  divider: '#262a33',

  zLoginPhoto: 2,
  zLoginCard: 3,
  zSidebar: 10,
  zBrandAsset: 20,

  focusRing: '0 0 0 3px rgba(129, 140, 248, 0.55)',
  transitionFast: '120ms ease-out',
  transitionStandard: '200ms ease-in-out',

  space1: 4,
  space2: 8,
  space3: 12,
  space4: 16,
  space5: 20,
  space6: 24,
  space8: 32,
  space10: 40,

  blurStrength: 16,
  surfaceOpacity: 0.85,
}

export type ThemeTokens = typeof lightTokens
