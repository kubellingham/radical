// Ink on paper, with one drop of seal red.
//
// The app is monochrome. Color appears in exactly one place — the drift
// indicator on the one language that needs attention — so it means exactly
// one thing. No other color is ever added to this file.

export const colors = {
  /** Ground. */
  ink: '#16181D',
  /** Primary text, card surfaces on light. */
  paper: '#F2EFE9',
  /** Secondary text. */
  slate: '#6B7078',
  /** Dividers, card borders. */
  rule: '#2A2D34',
  /**
   * The one accent. Reserved for the drift indicator (Phase 4).
   * Not used anywhere before then, and nowhere else after.
   */
  seal: '#A8342A',
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 40,
} as const;

// System UI stack for body and interface. For display characters on cards,
// size is the whole treatment.
export const type = {
  /** A Sino triple card's single character. */
  display: 120,
  /** A language's stand-in character (日 한 中 ñ Я). */
  glyph: 34,
  title: 22,
  body: 16,
  small: 13,
  micro: 11,
} as const;
