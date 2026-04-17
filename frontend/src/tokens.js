// ─── CRMaosBike · Design Tokens (JS mirror) ──────────────────────────────────
// Fuente única de verdad para usar en CSS-in-JS (inline styles, style={}).
// Espejo 1:1 de ./tokens.css. Si cambias uno, cambia el otro.
//
// Decisiones aplicadas:
//   · Paleta neutra → Tailwind `gray` (descartadas `slate` y legacy).
//   · SLA warning → color.warning (#F59E0B), separado del brand (#F28100).
//   · Aditivo: nadie lo consume todavía.

export const T = {
  color: {
    // Surface
    surface:        '#FFFFFF',
    surfaceMuted:   '#F9FAFB',
    surfaceSunken:  '#F3F4F6',

    // Text (Tailwind gray)
    text:           '#111827',
    textStrong:     '#1F2937',
    textBody:       '#374151',
    textMuted:      '#4B5563',
    textSubtle:     '#6B7280',
    textDisabled:   '#9CA3AF',
    textPlaceholder:'#D1D5DB',
    textOnBrand:    '#FFFFFF',
    textOnDark:     '#FFFFFF',

    // Border (Tailwind gray)
    border:         '#E5E7EB',
    borderStrong:   '#D1D5DB',
    borderSubtle:   '#F3F4F6',

    // Brand
    brand:          '#F28100',
    brandHover:     '#C2410C',
    brandSoft:      'rgba(242, 129, 0, 0.10)',
    brandMuted:     'rgba(242, 129, 0, 0.15)',
    brandStrong:    'rgba(242, 129, 0, 0.30)',

    // Feedback
    success:        '#10B981',
    successStrong:  '#059669',
    successDark:    '#15803D',
    successSoft:    '#F0FDF4',
    successMuted:   '#ECFDF5',

    warning:        '#F59E0B',
    warningStrong:  '#B45309',
    warningDark:    '#92400E',
    warningSoft:    '#FFFBEB',
    warningMuted:   '#FEF3C7',

    danger:         '#EF4444',
    dangerStrong:   '#DC2626',
    dangerDark:     '#B91C1C',
    dangerSoft:     '#FEF2F2',
    dangerMuted:    '#FEE2E2',

    info:           '#3B82F6',
    infoStrong:     '#2563EB',
    infoSoft:       '#EFF6FF',

    cyan:           '#06B6D4',
    cyanSoft:       '#ECFEFF',

    purple:         '#8B5CF6',
    purpleStrong:   '#7C3AED',
    purpleSoft:     '#F5F3FF',

    // Overlays
    overlay0:       'rgba(0, 0, 0, 0.04)',
    overlay1:       'rgba(0, 0, 0, 0.06)',
    overlay2:       'rgba(0, 0, 0, 0.10)',
    overlay3:       'rgba(0, 0, 0, 0.18)',
    overlay4:       'rgba(0, 0, 0, 0.30)',
    overlay5:       'rgba(0, 0, 0, 0.55)',
    scrim:          'rgba(0, 0, 0, 0.45)',
    scrimStrong:    'rgba(0, 0, 0, 0.60)',
    scrimHeavy:     'rgba(0, 0, 0, 0.75)',

    whiteSoft:      'rgba(255, 255, 255, 0.10)',
    whiteMuted:     'rgba(255, 255, 255, 0.40)',
    whiteStrong:    'rgba(255, 255, 255, 0.90)',

    // Indigo (trazabilidad, año, historial)
    indigo:         '#4F46E5',
    indigoStrong:   '#6366F1',
    indigoSoft:     '#EEF2FF',
    indigoMuted:    '#C7D2FE',
    indigoHover:    '#A5B4FC',
  },

  // Spacing (base-4). Valores en px (number) para usar directo en inline styles.
  space: {
    0:   0,
    0.5: 2,
    1:   4,
    1.5: 6,
    2:   8,
    2.5: 10,
    3:  12,
    3.5: 14,
    4:  16,
    4.5: 18,
    5:  20,
    5.5: 22,
    6:  24,
    8:  32,
    10: 40,
    12: 48,
  },

  radius: {
    xs:    4,
    sm:    6,
    md:    8,
    lg:   12,
    xl:   16,
    '2xl':18,
    pill: 999,
    full: '50%',
  },

  fs: {
    '2xs':  9,
    xxs:  10,
    xs:   11,
    sm:   12,
    base: 13,
    md:   14,
    lg:   16,
    xl:   18,
    '2xl':22,
    '3xl':28,
  },

  fw: {
    regular: 400,
    medium:  500,
    semi:    600,
    bold:    700,
    xbold:   800,
    black:   900,
  },

  lh: {
    tight:   1.2,
    normal:  1.45,
    relaxed: 1.6,
  },

  font: {
    sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
    mono: "ui-monospace, SFMono-Regular, Menlo, 'Courier New', monospace",
  },

  shadow: {
    sm:        '0 1px 3px rgba(0, 0, 0, 0.04)',
    md:        '0 2px 8px rgba(0, 0, 0, 0.06)',
    lg:        '0 20px 60px rgba(0, 0, 0, 0.18)',
    xl:        '0 32px 80px rgba(0, 0, 0, 0.35)',
    brand:     '0 2px 8px rgba(242, 129, 0, 0.35)',
    ringFocus: '0 0 0 3px rgba(242, 129, 0, 0.25)',
  },

  bp: {
    mobile: 768,
    tablet: 1024,
  },

  z: {
    base:       1,
    sticky:    10,
    modal:     60,
    bottomNav: 70,
    drawer:    89,
    header:    90,
    toast:    100,
    overlay:   50,
    overlayUi: 51,
    modalAbove:500,
    modalTop: 1002,
    blocking: 2000,
  },

  transition: {
    fast: '120ms ease',
    base: '200ms ease',
    slow: '300ms ease',
  },
};

export default T;
