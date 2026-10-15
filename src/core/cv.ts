/**
 * Stratified k-fold cross-validation and validation curves (Spec 3.4).
 * Trees are fitted with `fitTree` (which applies ccpAlpha); no tree math lives here.
 */
import { DtError } from './errors'
import { fitTree, predict, type TreeParams } from './tree'

function badParam(param: string): DtError {
  return new DtError('BAD_PARAM', { param })
}

/**
 * Port of sklearn 1.5 `StratifiedKFold(shuffle=False)._make_test_folds`: returns the test fold of each row.
 * Classes are numbered by first occurrence; the sorted encoded labels are dealt out round-robin
 * (`bincount(y_order[i::k])`) to decide how many rows of each class land in fold i, and each class's
 * rows (in data order) are then assigned `repeat(arange(k), allocation[:, class])`.
 */
export function stratifiedKFold(y: number[], k: number): number[] {
  const n = y.length
  if (!Number.isInteger(k) || k < 2 || k > n) throw badParam('k')
  const codeOf = new Map<number, number>()
  const encoded = y.map((v) => {
    let c = codeOf.get(v)
    if (c === undefined) {
      c = codeOf.size
      codeOf.set(v, c)
    }
    return c
  })
  const nClasses = codeOf.size
  const order = [...encoded].sort((a, b) => a - b)
  // allocation[i][c] = number of class-c rows in the strided slice order[i::k]
  const allocation: number[][] = []
  for (let i = 0; i < k; i++) {
    const row = new Array<number>(nClasses).fill(0)
    for (let j = i; j < n; j += k) row[order[j]]++
    allocation.push(row)
  }
  const folds = new Array<number>(n).fill(0)
  for (let c = 0; c < nClasses; c++) {
    const forClass: number[] = []
    for (let f = 0; f < k; f++) for (let r = 0; r < allocation[f][c]; r++) forClass.push(f)
    let p = 0
    for (let i = 0; i < n; i++) if (encoded[i] === c) folds[i] = forClass[p++]
  }
  return folds
}

/** k = min(kMax, smallest class count); a class with fewer than 2 rows raises `TOO_FEW_PER_CLASS`. */
export function chooseK(y: number[], nClasses: number, kMax = 5): number {
  const counts = new Array<number>(nClasses).fill(0)
  for (const v of y) {
    if (!Number.isInteger(v) || v < 0 || v >= nClasses) throw badParam('y')
    counts[v]++
  }
  let k = kMax
  for (let cls = 0; cls < nClasses; cls++) {
    if (counts[cls] === 0) continue // classes absent from y do not take part
    if (counts[cls] < 2) throw new DtError('TOO_FEW_PER_CLASS', { cls, count: counts[cls] })
    k = Math.min(k, counts[cls])
  }
  return k
}

export function accuracy(yTrue: number[], yPred: number[]): number {
  if (yTrue.length !== yPred.length || yTrue.length === 0) throw badParam('y')
  let hit = 0
  for (let i = 0; i < yTrue.length; i++) if (yTrue[i] === yPred[i]) hit++
  return hit / yTrue.length
}

function meanOf(a: number[]): number {
  let s = 0
  for (const v of a) s += v
  return s / a.length
}

/** Population standard deviation (ddof 0, like `np.std`). */
function stdOf(a: number[]): number {
  const m = meanOf(a)
  let s = 0
  for (const v of a) s += (v - m) * (v - m)
  return Math.sqrt(s / a.length)
}

function foldScores(
  X: number[][],
  y: number[],
  nClasses: number,
  params: TreeParams,
  folds: number[],
  k: number,
): { test: number[]; train: number[] } {
  const test: number[] = []
  const train: number[] = []
  for (let f = 0; f < k; f++) {
    const trIdx: number[] = []
    const teIdx: number[] = []
    for (let i = 0; i < y.length; i++) (folds[i] === f ? teIdx : trIdx).push(i)
    const Xtr = trIdx.map((i) => X[i])
    const ytr = trIdx.map((i) => y[i])
    const tree = fitTree(Xtr, ytr, nClasses, params)
    train.push(accuracy(ytr, Xtr.map((x) => predict(tree, x))))
    const Xte = teIdx.map((i) => X[i])
    test.push(
      accuracy(
        teIdx.map((i) => y[i]),
        Xte.map((x) => predict(tree, x)),
      ),
    )
  }
  return { test, train }
}

export function crossValidate(
  X: number[][],
  y: number[],
  nClasses: number,
  params: TreeParams,
  k: number,
): { foldScores: number[]; trainScores: number[]; mean: number; std: number; trainMean: number } {
  if (X.length !== y.length) throw badParam('X')
  const folds = stratifiedKFold(y, k)
  const { test, train } = foldScores(X, y, nClasses, params, folds, k)
  return { foldScores: test, trainScores: train, mean: meanOf(test), std: stdOf(test), trainMean: meanOf(train) }
}

/**
 * Cross-validated scores while `param` takes each of `values` (maxDepth: null = unbounded;
 * ccpAlpha: numbers only). The folds are computed once and shared by all values.
 * `onStep(i)` is called after value i has been evaluated.
 */
export function validationCurve(
  X: number[][],
  y: number[],
  nClasses: number,
  base: TreeParams,
  param: 'maxDepth' | 'ccpAlpha',
  values: (number | null)[],
  k: number,
  onStep?: (i: number) => void,
): { value: number | null; trainMean: number; cvMean: number; cvStd: number }[] {
  if (X.length !== y.length) throw badParam('X')
  if (param !== 'maxDepth' && param !== 'ccpAlpha') throw badParam('param')
  const folds = stratifiedKFold(y, k)
  return values.map((value, i) => {
    if (param === 'ccpAlpha' && value === null) throw badParam('ccpAlpha')
    const params: TreeParams = param === 'maxDepth' ? { ...base, maxDepth: value } : { ...base, ccpAlpha: value as number }
    const { test, train } = foldScores(X, y, nClasses, params, folds, k)
    onStep?.(i)
    return { value, trainMean: meanOf(train), cvMean: meanOf(test), cvStd: stdOf(test) }
  })
}
