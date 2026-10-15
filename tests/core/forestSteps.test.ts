import { describe, expect, it } from 'vitest'
import { oobSteps } from '../../src/tools/forest/state'

describe('oobSteps', () => {
  it('keeps the fixed steps up to B and appends B itself', () => {
    expect(oobSteps(1)).toEqual([1])
    expect(oobSteps(30)).toEqual([1, 2, 5, 10, 20, 30])
    expect(oobSteps(50)).toEqual([1, 2, 5, 10, 20, 50])
    expect(oobSteps(300)).toEqual([1, 2, 5, 10, 20, 50, 100, 200, 300])
  })
})
