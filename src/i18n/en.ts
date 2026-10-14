import type de from './de'

type Messages<T> = { [K in keyof T]: T[K] extends string ? string : Messages<T[K]> }

const en: Messages<typeof de> = {
  app: {
    title: 'DT Labs',
  },
  nav: {
    home: 'Home',
    splits: 'Split Workshop',
    complexity: 'Complexity Lab',
    forest: 'Forest Lab',
    label: 'Tools',
  },
  lang: {
    toggle: 'Switch language',
  },
  notice: {
    invalidUrl: 'The address contains invalid values. Showing the default view instead.',
    dismiss: 'Dismiss notice',
  },
  home: {
    title: 'Decision trees to try out',
    lead: 'Three tools accompany the notebook on decision trees and random forests: choose splits yourself, tune the complexity of a tree, and compare many trees in a forest.',
    toolsTitle: 'Tools',
    goal: 'Learning goal',
    open: 'Open {tool}',
    tool: {
      splits: {
        summary: 'Choose splits step by step, see the impurity and gain of every candidate, and let the tree grow.',
        goal: 'You understand why a split is chosen and how ties and criteria affect it.',
      },
      complexity: {
        summary: 'Change depth, minimum sizes and pruning, and watch decision regions, cross-validation and the pruning path.',
        goal: 'You recognise over- and underfitting and choose the complexity of a tree on solid grounds.',
      },
      forest: {
        summary: 'Build a forest of bootstrap trees, compare voting with averaging, and measure the variance of a prediction.',
        goal: 'You understand why a forest varies less than a single tree and when correlation limits that.',
      },
    },
    noticeTitle: 'Notice',
    notice: 'Everything runs in the browser; your data never leaves your machine. The texts are written independently; references such as "textbook ch. 9" only point to where the course covers a topic.',
  },
  ref: {
    badge: 'Textbook ch. {chapter} · notebook cell {code}',
    badgeNoCode: 'Textbook ch. {chapter}',
  },
  plot: {
    point: 'Data point',
  },
  status: {
    loading: 'Computing …',
    empty: 'No data available.',
    error: 'Error:',
  },
}

export default en
