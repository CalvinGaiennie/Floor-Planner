/** Format decimal feet as imperial display string, e.g. 8.5 -> 8' 6" */
export function formatFeetInches(feet: number): string {
  const totalInches = Math.round(feet * 12)
  const ft = Math.floor(totalInches / 12)
  const inches = totalInches % 12
  if (inches === 0) return `${ft}'`
  return `${ft}' ${inches}"`
}

export function snapToGrid(value: number, grid = 0.5): number {
  return Math.round(value / grid) * grid
}
