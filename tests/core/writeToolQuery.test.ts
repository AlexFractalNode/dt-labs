// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { removeScenarioParam, writeToolQuery } from '../../src/tools/scenarioUrl'
import { sameHash } from '../../src/urlState'

function setLive(hash: string): void {
  history.replaceState(null, '', hash)
}

describe('writeToolQuery', () => {
  it('writes the query and keeps lang and a scenario of the same tool', () => {
    setLive('#/splits?preset=speed&lang=en&scenario=s1')
    writeToolQuery('splits', { criterion: 'gini' })
    expect(window.location.hash).toBe('#/splits?criterion=gini&lang=en&scenario=s1')
  })

  it('drops a scenario of another tool', () => {
    setLive('#/splits?preset=speed&scenario=f2')
    writeToolQuery('splits', { preset: 'speed' })
    expect(window.location.hash).toBe('#/splits?preset=speed')
  })

  it('drops an unknown scenario', () => {
    setLive('#/forest?scenario=zz&lang=de')
    writeToolQuery('forest', {})
    expect(window.location.hash).toBe('#/forest?lang=de')
  })

  it('writes the bare tool path for an empty query', () => {
    setLive('#/complexity?seed=2')
    writeToolQuery('complexity', {})
    expect(window.location.hash).toBe('#/complexity')
  })
})

describe('removeScenarioParam', () => {
  it('removes only scenario', () => {
    setLive('#/splits?preset=speed&scenario=s1&lang=en')
    removeScenarioParam()
    expect(window.location.hash).toBe('#/splits?preset=speed&lang=en')
  })

  it('leaves an address without scenario as it is', () => {
    setLive('#/forest?B=100')
    removeScenarioParam()
    expect(window.location.hash).toBe('#/forest?B=100')
  })
})

describe('sameHash', () => {
  it('ignores parameter order', () => {
    expect(sameHash('#/splits?a=1&b=2', '#/splits?b=2&a=1')).toBe(true)
    expect(sameHash('#/splits?a=1', '#splits?a=1')).toBe(true)
  })

  it('distinguishes routes and values', () => {
    expect(sameHash('#/splits?a=1', '#/forest?a=1')).toBe(false)
    expect(sameHash('#/splits?a=1', '#/splits?a=2')).toBe(false)
    expect(sameHash('#/splits?a=1', '#/splits?a=1&b=2')).toBe(false)
  })
})
