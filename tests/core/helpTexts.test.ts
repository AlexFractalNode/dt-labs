import { describe, expect, it } from 'vitest'
import de from '../../src/i18n/de'
import en from '../../src/i18n/en'
import { HELP_TOPICS } from '../../src/tools/helpTopics'
import { TOOL_REFS } from '../../src/tools/toolRefs'
import type { ToolId } from '../../src/tools/scenarios'

/** Control keys per tool as fixed by the onboarding plan (Task 4). */
const CONTROLS: Record<ToolId, string[]> = {
  splits: ['criterion', 'build', 'data', 'tracer'],
  complexity: [
    'dataset',
    'n',
    'noise',
    'seed',
    'criterion',
    'maxDepth',
    'minSamplesSplit',
    'minSamplesLeaf',
    'minImpurityDecrease',
    'ccpAlpha',
    'curve',
  ],
  forest: ['dataset', 'n', 'noise', 'seed', 'B', 'maxFeatures', 'bootstrap', 'maxDepth', 'minSamplesLeaf', 'xStar', 'measure'],
}
const TOOLS = Object.keys(CONTROLS) as ToolId[]
const CATALOGUES = { de, en } as const

type Tree = { [k: string]: string | Tree }
const help = (lang: 'de' | 'en', tool: ToolId): Tree =>
  (CATALOGUES[lang] as unknown as { help?: Record<string, Tree> }).help?.[tool] ?? {}

describe('help texts', () => {
  for (const lang of ['de', 'en'] as const) {
    for (const tool of TOOLS) {
      it(`${lang}/${tool}: every control line is a non-empty string`, () => {
        const controls = (help(lang, tool).controls ?? {}) as Tree
        expect(Object.keys(controls).sort()).toEqual([...CONTROLS[tool]].sort())
        for (const key of CONTROLS[tool]) {
          expect(typeof controls[key], key).toBe('string')
          expect((controls[key] as string).trim().length, key).toBeGreaterThan(0)
        }
      })

      it(`${lang}/${tool}: purpose and every reading line are free of digits`, () => {
        const h = help(lang, tool)
        expect(typeof h.purpose).toBe('string')
        expect((h.purpose as string).trim().length).toBeGreaterThan(0)
        expect(h.purpose as string).not.toMatch(/\d/)
        const read = (h.read ?? {}) as Tree
        expect(Object.keys(read).length).toBeGreaterThan(0)
        for (const [k, v] of Object.entries(read)) {
          expect(typeof v, k).toBe('string')
          expect((v as string).trim().length, k).toBeGreaterThan(0)
          expect(v as string, k).not.toMatch(/\d/)
        }
      })

      it(`${lang}/${tool}: the topic list matches the catalogue`, () => {
        const read = (help(lang, tool).read ?? {}) as Tree
        expect(Object.keys(read).sort()).toEqual(HELP_TOPICS[tool].read.map((r) => r.key).sort())
        expect(HELP_TOPICS[tool].controls.map((c) => c.key).sort()).toEqual([...CONTROLS[tool]].sort())
      })
    }
  }

  it('has one reading line per visible panel', () => {
    expect(HELP_TOPICS.splits.read).toHaveLength(5)
    expect(HELP_TOPICS.complexity.read).toHaveLength(6)
    expect(HELP_TOPICS.forest.read).toHaveLength(6)
  })

  it('TOOL_REFS carries the chapter and notebook-cell ranges of the home cards', () => {
    expect(TOOL_REFS).toEqual({
      splits: { chapter: '3–5, 8.4', code: '99–128' },
      complexity: { chapter: '9–11', code: '62, 75–82, 170–212' },
      forest: { chapter: '12–13', code: '213–270' },
    })
  })
})
