/**
 * Impurity measures on class-count vectors (Spec 3.2). An empty count vector has impurity 0.
 */
export type Criterion = 'entropy' | 'gini' | 'misclass'

function total(counts: number[]): number {
  let n = 0
  for (const c of counts) n += c
  return n
}

/** Shannon entropy in bits; `Math.log(p) / Math.LN2` matches sklearn's float64 evaluation. */
export function entropy(counts: number[]): number {
  const n = total(counts)
  if (n <= 0) return 0
  let s = 0
  for (const c of counts) {
    if (c <= 0) continue
    const p = c / n
    s -= p * (Math.log(p) / Math.LN2)
  }
  return s
}

/** Gini impurity `1 - sum p_k^2`. */
export function gini(counts: number[]): number {
  const n = total(counts)
  if (n <= 0) return 0
  let s = 0
  for (const c of counts) {
    const p = c / n
    s += p * p
  }
  return 1 - s
}

/** Misclassification error `1 - max p_k`. */
export function misclass(counts: number[]): number {
  const n = total(counts)
  if (n <= 0) return 0
  let m = 0
  for (const c of counts) if (c > m) m = c
  return 1 - m / n
}

export function impurity(c: Criterion, counts: number[]): number {
  switch (c) {
    case 'entropy':
      return entropy(counts)
    case 'gini':
      return gini(counts)
    case 'misclass':
      return misclass(counts)
  }
}
