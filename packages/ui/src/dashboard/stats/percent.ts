/** 0.4567 → "46%"; undefined (nothing to divide by) → "—". */
export function percent(rate: number | undefined): string {
  return rate === undefined ? '—' : `${Math.round(rate * 100)}%`;
}
