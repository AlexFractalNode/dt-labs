import { expect } from 'vitest'
import type { Tree } from '../../src/core/tree'

const TOL = 1e-12

/** Test-only: tie oracle that answers with sklearn's split (feature, threshold) at each node id. */
export function oracleFrom(sk: any): (nodeId: number) => { feature: number; threshold: number } {
  return (nodeId: number) => ({ feature: sk.feature[nodeId], threshold: sk.threshold[nodeId] })
}

function expectClose(actual: number[], expected: number[], field: string): void {
  expect(actual.length, `${field} length`).toBe(expected.length)
  actual.forEach((a, i) => {
    const e = expected[i]
    if (!(Math.abs(a - e) <= TOL)) throw new Error(`${field}[${i}]: got ${a}, expected ${e}`)
  })
}

/** Test-only: structure arrays exactly, threshold/value/impurity/weightedNNodeSamples to 1e-12 (absolute). */
export function expectTreeEquals(ours: Tree, sk: any): void {
  expect(ours.childrenLeft, 'childrenLeft').toEqual(sk.childrenLeft)
  expect(ours.childrenRight, 'childrenRight').toEqual(sk.childrenRight)
  expect(ours.feature, 'feature').toEqual(sk.feature)
  expect(ours.nNodeSamples, 'nNodeSamples').toEqual(sk.nNodeSamples)
  expectClose(ours.threshold, sk.threshold, 'threshold')
  expectClose(ours.impurity, sk.impurity, 'impurity')
  expectClose(ours.weightedNNodeSamples, sk.weightedNNodeSamples, 'weightedNNodeSamples')
  expect(ours.value.length, 'value length').toBe(sk.value.length)
  ours.value.forEach((v, i) => expectClose(v, sk.value[i], `value[${i}]`))
}
