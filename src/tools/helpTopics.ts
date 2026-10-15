/**
 * Structure of the help drawer per tool (onboarding): which panels get a reading line (`help.<tool>.read.<key>`) and
 * which controls get a line (`help.<tool>.controls.<key>`). The names are the labels the tool itself shows, so the
 * drawer speaks the words of the interface; `literal` is used where no label exists (x*).
 */
import type { MessageKey } from '../i18n'
import type { ToolId } from './scenarios'

export interface ReadTopic {
  key: string
  /** The panel's own heading. */
  title: MessageKey
}
export interface ControlTopic {
  key: string
  /** The control's own label, or a literal such as `x*`. */
  label: MessageKey | { literal: string }
}

export const HELP_TOPICS: Record<ToolId, { read: ReadTopic[]; controls: ControlTopic[] }> = {
  splits: {
    read: [
      { key: 'data', title: 'splits.data.title' },
      { key: 'tree', title: 'splits.tree.title' },
      { key: 'candidates', title: 'splits.cand.title' },
      { key: 'mdi', title: 'splits.mdi.title' },
      { key: 'tracer', title: 'splits.trace.title' },
    ],
    controls: [
      { key: 'criterion', label: 'splits.criterion.label' },
      { key: 'build', label: 'splits.action.label' },
      { key: 'data', label: 'splits.data.presetLabel' },
      { key: 'tracer', label: 'splits.trace.title' },
    ],
  },
  complexity: {
    read: [
      { key: 'params', title: 'complexity.params.title' },
      { key: 'regions', title: 'complexity.plot.title' },
      { key: 'tree', title: 'complexity.tree.title' },
      { key: 'metrics', title: 'complexity.metrics.title' },
      { key: 'curve', title: 'complexity.curve.title' },
      { key: 'path', title: 'complexity.path.title' },
    ],
    controls: [
      { key: 'dataset', label: 'complexity.data.presetLabel' },
      { key: 'n', label: 'complexity.data.n' },
      { key: 'noise', label: 'complexity.data.noise' },
      { key: 'seed', label: 'complexity.data.seed' },
      { key: 'criterion', label: 'complexity.params.criterion' },
      { key: 'maxDepth', label: 'complexity.params.depth' },
      { key: 'minSamplesSplit', label: 'complexity.params.split' },
      { key: 'minSamplesLeaf', label: 'complexity.params.leaf' },
      { key: 'minImpurityDecrease', label: 'complexity.params.mid' },
      { key: 'ccpAlpha', label: 'complexity.params.alpha' },
      { key: 'curve', label: 'complexity.curve.param' },
    ],
  },
  forest: {
    read: [
      { key: 'params', title: 'forest.params.title' },
      { key: 'regions', title: 'forest.plot.title' },
      { key: 'vote', title: 'forest.vote.title' },
      { key: 'gallery', title: 'forest.gallery.title' },
      { key: 'oob', title: 'forest.oob.title' },
      { key: 'variance', title: 'forest.variance.title' },
    ],
    controls: [
      { key: 'dataset', label: 'forest.data.presetLabel' },
      { key: 'n', label: 'forest.data.n' },
      { key: 'noise', label: 'forest.data.noise' },
      { key: 'seed', label: 'forest.data.seed' },
      { key: 'B', label: 'forest.params.trees' },
      { key: 'maxFeatures', label: 'forest.params.maxFeatures' },
      { key: 'bootstrap', label: 'forest.params.bootstrap' },
      { key: 'maxDepth', label: 'forest.params.depth' },
      { key: 'minSamplesLeaf', label: 'forest.params.leaf' },
      { key: 'xStar', label: { literal: 'x*' } },
      { key: 'measure', label: 'forest.variance.measure' },
    ],
  },
}
