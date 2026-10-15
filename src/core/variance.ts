/**
 * Variance of a forest prediction (Spec 3.5): the model formula `rho*sigma2 + (1 - rho)*sigma2/B`
 * and its measurement over fresh samples of the same generator.
 */
import { DtError } from './errors'
import { aggregate, fitForest, treeProbas, type ForestParams } from './forest'
import { generate, type GeneratorName } from './generators'

/** Below this the trees do not spread at x* and rho / the formula are undefined. */
const NO_SPREAD = 1e-12
/** Offset between the forest seed and the replicate seeds (`p.seed + 1000 + r`). */
const REPLICATE_SEED_OFFSET = 1000

function badParam(param: string): DtError {
  return new DtError('BAD_PARAM', { param })
}

/** Variance of the mean of B identically distributed predictions with variance sigma2 and correlation rho. */
export function ensembleVariance(sigma2: number, rho: number, B: number): number {
  if (!Number.isFinite(sigma2) || sigma2 < 0) throw badParam('sigma2')
  if (!Number.isFinite(rho) || rho < -1 || rho > 1) throw badParam('rho')
  if (!Number.isInteger(B) || B < 1) throw badParam('B')
  return rho * sigma2 + ((1 - rho) * sigma2) / B
}

function meanOf(v: number[]): number {
  let s = 0
  for (const x of v) s += x
  return s / v.length
}

/** Population variance (ddof 0, like np.var). */
function varianceOf(v: number[], mean: number): number {
  let s = 0
  for (const x of v) s += (x - mean) * (x - mean)
  return s / v.length
}

/**
 * Measure the spread of the class-1 probability at `xStar` over `replicates` fresh data sets.
 * Replicate r draws its data with seed `p.seed + 1000 + r` and fits the forest with that seed too.
 * - sigma2: mean over tree indices of the across-replicate variance (ddof 0) of that tree's prediction
 * - rho: mean across-replicate correlation over tree pairs; pairs with a tree that does not vary
 *   (variance < 1e-12) are skipped. Null when sigma2 < 1e-12 or no pair is left (e.g. B = 1).
 * - varMeasured: across-replicate variance (ddof 0) of the forest's mean prediction
 * - varFormula: `ensembleVariance(sigma2, rho, B)`; for B = 1 it is sigma2 (rho does not enter),
 *   otherwise null whenever rho is null.
 */
export function measureVariance(
  gen: { name: GeneratorName; n: number; noise: number },
  xStar: number[],
  p: ForestParams,
  replicates: number,
  onStep?: (i: number) => void,
): { sigma2: number; rho: number | null; varMeasured: number; varFormula: number | null } {
  if (!Number.isInteger(replicates) || replicates < 2) throw badParam('replicates')
  if (!Array.isArray(xStar) || xStar.length !== 2 || !xStar.every(Number.isFinite)) throw badParam('xStar')
  if (!Number.isInteger(p.nEstimators) || p.nEstimators < 1) throw badParam('nEstimators')
  if (!Number.isInteger(p.seed)) throw badParam('seed')
  const B = p.nEstimators

  // perTree[b][r]: class-1 probability of tree b in replicate r
  const perTree: number[][] = Array.from({ length: B }, () => [])
  const forestMean: number[] = []
  for (let r = 0; r < replicates; r++) {
    const seed = p.seed + REPLICATE_SEED_OFFSET + r
    const data = generate(gen.name, gen.n, gen.noise, seed)
    const forest = fitForest(data.X, data.y, 2, { ...p, seed })
    const probas = treeProbas(forest, xStar)
    probas.forEach((proba, b) => perTree[b].push(proba[1]))
    forestMean.push(aggregate(probas).mean[1]) // = forestProba(forest, xStar)[1]
    onStep?.(r)
  }

  const means = perTree.map(meanOf)
  const vars = perTree.map((v, b) => varianceOf(v, means[b]))
  const sigma2 = meanOf(vars)
  const fm = meanOf(forestMean)
  const varMeasured = varianceOf(forestMean, fm)
  if (sigma2 < NO_SPREAD) return { sigma2, rho: null, varMeasured, varFormula: null }

  let corrSum = 0
  let pairs = 0
  for (let i = 0; i < B; i++) {
    if (vars[i] < NO_SPREAD) continue
    for (let j = i + 1; j < B; j++) {
      if (vars[j] < NO_SPREAD) continue
      let cov = 0
      for (let r = 0; r < replicates; r++) cov += (perTree[i][r] - means[i]) * (perTree[j][r] - means[j])
      cov /= replicates
      const corr = cov / Math.sqrt(vars[i] * vars[j])
      corrSum += Math.min(1, Math.max(-1, corr))
      pairs++
    }
  }
  const rho = pairs === 0 ? null : corrSum / pairs
  let varFormula: number | null
  if (B === 1) varFormula = sigma2
  else varFormula = rho === null ? null : ensembleVariance(sigma2, rho, B)
  return { sigma2, rho, varMeasured, varFormula }
}
