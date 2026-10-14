/**
 * Mean decrease in impurity (MDI): globally weighted gains summed per feature, normalised to 1.
 * Without any contribution (or with total gain 0) every feature gets 0.
 */
export function mdi(contribs: { feature: number; globalGain: number }[], nFeatures: number): number[] {
  const sums = new Array<number>(nFeatures).fill(0)
  for (const { feature, globalGain } of contribs) sums[feature] += globalGain
  let total = 0
  for (const s of sums) total += s
  if (!(total > 0)) return sums.map(() => 0)
  return sums.map((s) => s / total)
}
