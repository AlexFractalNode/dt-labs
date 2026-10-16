# DT Labs

Interactive companion tools for **Notebook 02 *Decision Trees and Random Forest*** and the accompanying textbook of the
course *Data Science 3* at WHZ (Westsächsische Hochschule Zwickau).

DT Labs is a static web app (Vue 3 + Vite + TypeScript) with three tools. It runs entirely in the browser: no
backend, no login, no installation. Every view has its own URL, so a specific setup can be shared as a link.
The interface is bilingual (German by default, English via the toggle or `?lang=en`).

The app does not reproduce the textbook. Its texts are written independently; references such as
"Lehrbuch Kap. 9 · Notebook Zelle 62" only point to where a topic is covered in the course materials
(cell numbers are zero-based cells of the original notebook).

## Tools and example links

Live site (after the first deployment): <https://alexfractalnode.github.io/dt-labs/>

| Tool | Route | What it shows | Example |
|---|---|---|---|
| Split Workshop (Split-Werkstatt) | `#/splits` | Choose splits step by step, see impurity and gain of every candidate, tie markers, a path tracer, and let the tree grow on its own | `#/splits?preset=eight&grow=auto` (the eight-case example, finished tree) |
| Complexity Lab (Komplexitäts-Labor) | `#/complexity` | Depth, minimum sizes and cost-complexity pruning; decision regions, cross-validation, validation curve and pruning path | `#/complexity?preset=eight&criterion=entropy&alpha=0.45` |
| Forest Lab (Forest-Labor) | `#/forest` | Bootstrap trees, tree gallery, vote vs. averaging, OOB score and a variance lab (measurement in a Web Worker) | `#/forest?B=100` |

Prefix the routes with the site URL, e.g. `https://alexfractalnode.github.io/dt-labs/#/splits?preset=eight&grow=auto`.
Invalid URL parameters fall back to a default view and show a notice.

Further parameters:

- `#/splits`: `preset` (`speed`, `eight`, `weather`), `criterion` (`entropy`, `gini`, `misclass`), `grow=auto`.
- `#/complexity`: `preset` (`eight`, `xor`, `moons`, `circles`, `diagonal`), `n`, `noise`, `seed`, `criterion`,
  `depth`, `split`, `leaf`, `mid`, `alpha`, `curve`.
- `#/forest`: `preset`, `n`, `noise`, `seed`, `B`, `mf` (1 or 2), `bootstrap`, `depth`, `leaf`.

## Scenarios and help

Each tool offers three ready-made scenarios: complete tool states with a short explanation of what to look at. They are
shown above the controls of a tool and linked from the cards on the home page. A scenario is part of the address, so it
can be shared like any other setup, e.g. `#/complexity?seed=2&scenario=c1`. The scenario ids are `s1`–`s3` (Split
Workshop), `c1`–`c3` (Complexity Lab) and `f1`–`f3` (Forest Lab). An unknown id, or one that belongs to another tool,
is ignored and reported in the notice about the address. Changing a setting marks the scenario as modified and offers
to restore it.

Every tool also has a help drawer (button "Hilfe" / "Help" in the tool header): a short explanation of the controls and
plots, and how they relate to the textbook chapter. The language follows the toggle or `?lang=`.

The home page also lists a short roadmap of ideas for further tools on the same computing core (see below); they are
not part of this version.

## Local development

Requirements: Node 24 and npm. For the Python checks: [uv](https://docs.astral.sh/uv/) (it fetches Python 3.10 itself).

```sh
npm install
npm run dev          # http://localhost:5176
npm run build        # type check (vue-tsc) + production build into dist/
npm run preview      # serve dist/ on http://localhost:4173
```

## Tests

```sh
npm run guard        # fails if course materials (.ipynb, .pdf, materials/) are tracked by git
npm test             # unit and golden tests (Vitest)
npm run test:py      # Python checks (pytest via uv): committed golden files match scripts/make_golden.py
npm run golden       # regenerate tests/golden/*.json from scripts/make_golden.py
```

End-to-end tests (Playwright) run against the production build, served by `vite preview` on port 4175. Install the
browser once, then run the suite:

```sh
npx playwright install chromium
npm run test:e2e
```

### The golden-test approach

`scripts/make_golden.py` computes reference values with scikit-learn and writes them to `tests/golden/*.json`. The
TypeScript core (`src/core/`) is checked against these files in Vitest.

- **Pinned versions:** Python 3.10, scikit-learn 1.5.0, NumPy 1.26.4 and pandas 2.2.2, run through `uv`
  (see the `golden` and `test:py` scripts). The reference values therefore come from fixed library versions.
- **Inputs plus expectations:** the JSON files contain the input data (exported from NumPy) and the expected results
  (tree arrays, importances, cross-validation folds and scores, pruning paths, forest probabilities). The tests do not
  use the app's synthetic generators for this.
- **Tie detection:** when several split candidates have the same sklearn proxy gain, sklearn picks one depending on
  `random_state`. The script recomputes the proxy gains of all candidates at every sklearn node and stores the nodes
  with a tie (`tieNodes`) together with the split sklearn chose.
- **Oracle mode:** in the TypeScript tests, `fitTree` can be given a `tieOracle`. At a node with a tie it takes the
  split named by the oracle, but only if that split belongs to the set of tied maximum candidates, otherwise the test
  fails. That keeps tie cases (XOR, the eight-case example with `random_state=1`, forest trees) exactly comparable.
- **Tolerances:** tree structure exactly (ties via the oracle), numbers within `1e-12`. `pytest` checks that the
  committed golden files are reproducible from the script with `rtol=1e-12` (`np.sin`/`np.cos` can differ in the last
  digit between CPUs). The forest with `max_features=1` is only compared statistically: the mean OOB score over
  20 seeds differs from sklearn's by at most 0.02.

## Conventions and deviations from scikit-learn

The tree builder follows sklearn's `DepthFirstTreeBuilder` and `BestSplitter`. These points differ or need care when
you compare numbers with the notebook:

- **Tie rule.** If several candidates have the same gain (difference at most `1e-12`), the app takes the first one:
  lowest feature index, then the smaller threshold (or category code). Ties are marked in the UI. sklearn chooses
  at random depending on `random_state`; the notebook example in cell 125 (`random_state=1`) ends up with `a2 ≤ 2.5`.
- **Split proxy.** The split is chosen by sklearn's proxy `−wR·I_R − wL·I_L` with a strict inequality (for Gini and
  entropy alike in sklearn 1.5.0). The displayed gain is the usual decrease of impurity.
- **float32.** Inputs and thresholds are rounded to float32 like sklearn does, both when fitting and when predicting.
  Neighbouring values count as different only above a small tolerance.
- **Pruning.** Cost-complexity pruning follows `_cost_complexity_prune`: in every iteration exactly one branch with the
  smallest effective α collapses (ties: smallest preorder index), so equal α values can appear several times in the
  path (the UI may merge them for display). The path starts at α = 0, and α = 0 is the identity.
- **Cross-validation.** The folds are stratified without shuffling like `StratifiedKFold(shuffle=False)`. The tools
  use `k = min(5, size of the smallest class)`; the label always names the fold count (the eight-case example with
  classes 5/3 runs 3-fold). With fewer than 2 cases in a class the core reports `TOO_FEW_PER_CLASS`.
  For deep trees the CV scores can differ from the notebook by about ±0.01, because sklearn resolves ties at random.
- **OOB score.** It is computed over the cases covered by at least one tree, and the number of never-covered cases is
  reported next to it. sklearn silently counts uncovered cases as class 0.
- **Feature draws (`maxFeatures`).** At each node features are drawn in random order without replacement, and the
  draw continues until `k` non-constant features have been evaluated. sklearn also counts drawn constant features
  towards `k` when `k >= 2`, so the two can differ there. The app's settings (`k = 1` and `k = all`) behave
  identically. Bootstrap counts enter the trees as sample weights.
- **`mf = 2` means all features.** The synthetic data sets have two features, so `mf=2` is plain bagging without
  feature subsampling; with bootstrap switched off all trees are identical.
- **Misclassification error.** Offered in the Split Workshop for teaching only; sklearn has no such criterion, so it
  has no golden counterpart.

Not part of this version, listed as ideas on the home page: a regression-tree tool (ch. 14), an information
calculator (entropy, cross-entropy, KL; ch. 1–2, 4), an exercise trainer with randomised variants, a leakage lab with
the Titanic data (ch. 6–8), an Adult explorer (ch. 7), IFrame embedding in the DS hub, and integration into the
learning website.

## Deployment (GitHub Pages)

`.github/workflows/pages.yml` runs on every push to `main` and on every pull request: material guard, Python checks,
unit tests and a build with `BASE_PATH=/dt-labs/`. Only a push to `main` then uploads `dist/` and deploys it to GitHub
Pages via GitHub Actions; pull requests never deploy.

One-time setup after the first push: in the repository, open **Settings → Pages → Build and deployment** and set
**Source: GitHub Actions**.

## Data

The data sets are small teaching examples. Speed (4 cases), Eight cases and Weather (Play Tennis, after Quinlan 1986)
are described in [`public/data/SOURCE.md`](public/data/SOURCE.md); the other data sets are generated in the browser
from seeded code.

## Course materials

The textbook, the notebook, the slides and the course data sets are **not** part of this repository and are never
committed. `npm run guard` and a CI step enforce this for `.ipynb`, `.pdf` and `materials/`.

## Licence

Code: [MIT](LICENSE).
