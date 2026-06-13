// Result colors. The colorblind-safe palette swaps the fail red for blue so
// great/good/miss never hinge on red/green discrimination; the timing tape
// additionally encodes results by tick SHAPE (see tape.ts) so the palette is
// never the only cue.

export interface ResultPalette {
  great: string;
  good: string;
  miss: string;
}

export const DEFAULT_PALETTE: ResultPalette = {
  great: '#e8c34a',
  good: '#cfd6d4',
  miss: '#d6453a',
};

export const CB_PALETTE: ResultPalette = {
  great: '#e8c34a',
  good: '#cfd6d4',
  miss: '#4d9fd6',
};

/** '#rrggbb' → 'rgba(r,g,b,a)' for canvas fills with custom alpha. */
export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
