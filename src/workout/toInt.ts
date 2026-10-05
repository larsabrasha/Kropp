/** A whole number, rounded half to even: 2.5 becomes 2 and 3.5 becomes 4. */
export function toInt(value: number | undefined): number | undefined {
  if (value === undefined) return undefined
  const rounded = Math.round(value)
  return Math.abs(value % 1) === 0.5 && rounded % 2 !== 0 ? rounded - 1 : rounded
}
