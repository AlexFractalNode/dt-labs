"""Generate the golden JSON files in tests/golden/ (the oracle for the TypeScript CART core).

Run via `npm run golden`. Three files:

- textbook.json: hand-computation reference (Spec 3.2) from an explicit Python transcription
  (`py_candidates`), plus the textbook eight-case tree, its MDI and its sklearn pruning path.
- cart.json: scikit-learn 1.5.0 DecisionTreeClassifier fits with full `tree_` arrays. For each fit
  `find_tie_nodes` recomputes the proxy improvement of every (feature, threshold) candidate at every
  internal node and lists the nodes whose maximum is attained more than once (sklearn breaks those
  ties by a random feature order, so the TypeScript tree is compared there through a tie oracle).
- cv.json: StratifiedKFold test folds, cross_validate and validation_curve scores.
"""
import json
import math
from pathlib import Path

import numpy as np
import sklearn
from sklearn.datasets import make_circles, make_moons
from sklearn.ensemble._forest import _generate_sample_indices
from sklearn.model_selection import StratifiedKFold, cross_validate, validation_curve
from sklearn.tree import DecisionTreeClassifier

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "tests" / "golden"
META = {"numpy": np.__version__, "sklearn": sklearn.__version__, "generated_by": "scripts/make_golden.py"}

EPSILON = 2.220446049250313e-16  # np.finfo(np.float64).eps, sklearn's leaf / min_impurity_decrease slack
FEATURE_THRESHOLD = np.float32(1e-7)  # sklearn _splitter.pyx
TIE_RTOL = 1e-12


def jsonable(obj):
    """Convert numpy scalars/arrays recursively into plain Python values (floats keep their repr)."""
    if isinstance(obj, dict):
        return {str(k): jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [jsonable(v) for v in obj]
    if isinstance(obj, np.ndarray):
        return jsonable(obj.tolist())
    if isinstance(obj, (bool, np.bool_)):
        return bool(obj)
    if isinstance(obj, (int, np.integer)):
        return int(obj)
    if isinstance(obj, (float, np.floating)):
        value = float(obj)
        if not math.isfinite(value):
            raise ValueError(f"non-finite float in golden data: {value}")
        return value
    if obj is None or isinstance(obj, str):
        return obj
    raise TypeError(f"cannot serialise {type(obj)}")


# ---------------------------------------------------------------- impurity (Spec 3.2)

def impurity(counts, criterion):
    counts = np.asarray(counts, float)
    n = counts.sum()
    if n <= 0:
        raise ValueError("impurity of an empty node")
    p = counts / n
    if criterion == "entropy":
        return float(-sum(q * math.log2(q) for q in p if q > 0))
    if criterion == "gini":
        return float(1.0 - np.sum(p * p))
    if criterion == "misclass":
        return float(1.0 - p.max())
    raise ValueError(f"unknown criterion {criterion}")


def split_gain(parent, children, criterion):
    """Local impurity decrease I(t) - sum_j n_j/n_t I(j) for class-count vectors."""
    n = float(np.sum(parent))
    rest = sum(float(np.sum(c)) / n * impurity(c, criterion) for c in children)
    return impurity(parent, criterion) - rest


def class_counts(y, n_classes):
    return np.bincount(np.asarray(y, int), minlength=n_classes).astype(int)


# ---------------------------------------------------------------- hand-computation reference

def py_candidates(X, y, kinds, criterion, n_classes):
    """All split candidates of one node (rows X, y) sorted by (feature, value), Spec 3.2.

    Numeric: thresholds at plain midpoints (a + b) / 2 of adjacent distinct values, left = x <= t.
    Categorical: "x == c" (left = yes) for each category code present; with exactly two present
    only the smaller code. Features with a single value in the node yield no candidate.
    """
    X = np.asarray(X, float)
    y = np.asarray(y, int)
    parent = class_counts(y, n_classes)
    parent_imp = impurity(parent, criterion)
    n = len(y)
    out = []
    for j, kind in enumerate(kinds):
        col = X[:, j]
        values = sorted(set(col.tolist()))
        if len(values) < 2:
            continue
        if kind == "numeric":
            tests = [("threshold", (a + b) / 2, col <= (a + b) / 2) for a, b in zip(values, values[1:])]
        elif kind == "categorical":
            codes = values[:1] if len(values) == 2 else values
            tests = [("category", int(c), col == c) for c in codes]
        else:
            raise ValueError(f"unknown feature kind {kind}")
        for test_kind, value, mask in tests:
            left, right = class_counts(y[mask], n_classes), class_counts(y[~mask], n_classes)
            nl, nr = int(left.sum()), int(right.sum())
            child = nl / n * impurity(left, criterion) + nr / n * impurity(right, criterion)
            out.append({"feature": j, "kind": test_kind, "value": value, "left": left.tolist(),
                        "right": right.tolist(), "childImpurity": child, "gain": parent_imp - child})
    return out


def multiway_gain(X, y, kinds, n_classes, criterion="entropy"):
    """ID3 multiway gain per categorical feature (one child per category present); None for numeric."""
    X = np.asarray(X, float)
    y = np.asarray(y, int)
    parent = class_counts(y, n_classes)
    gains = []
    for j, kind in enumerate(kinds):
        if kind != "categorical":
            gains.append(None)
            continue
        col = X[:, j]
        children = [class_counts(y[col == c], n_classes) for c in sorted(set(col.tolist()))]
        gains.append(split_gain(parent, children, criterion))
    return gains


def encode(columns, target, numeric=()):
    """Raw columns -> (features, X, y, classNames); category codes by first appearance, classes sorted."""
    features, coded = [], []
    for name, raw in columns.items():
        if name in numeric:
            features.append({"name": name, "kind": "numeric"})
            coded.append(list(raw))
            continue
        cats = list(dict.fromkeys(raw))
        features.append({"name": name, "kind": "categorical", "categories": cats})
        coded.append([cats.index(v) for v in raw])
    classes = sorted(set(target))
    X = [list(row) for row in zip(*coded)]
    y = [classes.index(v) for v in target]
    return features, X, y, [str(c) for c in classes]


def textbook_dataset(columns, target, numeric=()):
    features, X, y, class_names = encode(columns, target, numeric)
    kinds = [f["kind"] for f in features]
    k = len(class_names)
    return {
        "features": features, "X": X, "y": y, "classNames": class_names,
        "rootCandidates": {c: py_candidates(X, y, kinds, c, k) for c in ("entropy", "gini", "misclass")},
        "multiwayGain": {"entropy": multiway_gain(X, y, kinds, k)},
    }


# Notebook cell 102
SPEED_COLUMNS = {
    "Grade": ["steep", "steep", "flat", "steep"],
    "Bumpiness": ["bumpiness", "smooth", "bumpiness", "smooth"],
    "Speed_Limit": ["yes", "yes", "no", "no"],
}
SPEED_TARGET = ["slow", "slow", "fast", "fast"]

# Notebook cell 121
EIGHT_COLUMNS = {"a1": [1, 1, 2, 2, 3, 3, 4, 4], "a2": [2, 3, 1, 2, 2, 3, 4, 4]}
EIGHT_TARGET = [0, 0, 0, 0, 0, 1, 1, 1]
EIGHT_X = np.array(list(zip(*EIGHT_COLUMNS.values())), float)
EIGHT_Y = np.array(EIGHT_TARGET, int)

# Quinlan's original Play-Tennis table (D1..D14), not the course file sun.csv
WEATHER_ROWS = [
    ("sunny", "hot", "high", "weak", "no"),
    ("sunny", "hot", "high", "strong", "no"),
    ("overcast", "hot", "high", "weak", "yes"),
    ("rain", "mild", "high", "weak", "yes"),
    ("rain", "cool", "normal", "weak", "yes"),
    ("rain", "cool", "normal", "strong", "no"),
    ("overcast", "cool", "normal", "strong", "yes"),
    ("sunny", "mild", "high", "weak", "no"),
    ("sunny", "cool", "normal", "weak", "yes"),
    ("rain", "mild", "normal", "weak", "yes"),
    ("sunny", "mild", "normal", "strong", "yes"),
    ("overcast", "mild", "high", "strong", "yes"),
    ("overcast", "hot", "normal", "weak", "yes"),
    ("rain", "mild", "high", "strong", "no"),
]
WEATHER_COLUMNS = {name: [r[i] for r in WEATHER_ROWS]
                   for i, name in enumerate(["outlook", "temperature", "humidity", "wind"])}
WEATHER_TARGET = [r[4] for r in WEATHER_ROWS]


def grow_first_wins(X, y, kinds, criterion, n_classes):
    """Greedy tree with the textbook tie rule (first candidate in (feature, value) order wins).

    Returns splits in preorder as {path, feature, threshold}, plus the global gains per feature.
    Splits with gain 0 are applied (like sklearn); recursion stops at pure nodes or without candidates.
    """
    X = np.asarray(X, float)
    y = np.asarray(y, int)
    n_total = len(y)
    splits, importances = [], np.zeros(len(kinds))

    def grow(rows, path):
        if impurity(class_counts(y[rows], n_classes), criterion) <= EPSILON:
            return
        cands = py_candidates(X[rows], y[rows], kinds, criterion, n_classes)
        if not cands:
            return
        best = cands[0]
        for c in cands[1:]:
            if c["gain"] > best["gain"] + TIE_RTOL:
                best = c
        if best["kind"] != "threshold":
            raise ValueError("grow_first_wins only handles numeric features")
        splits.append({"path": path, "feature": best["feature"], "threshold": best["value"]})
        importances[best["feature"]] += len(rows) / n_total * best["gain"]
        mask = X[rows, best["feature"]] <= best["value"]
        grow(rows[mask], path + "L")
        grow(rows[~mask], path + "R")

    grow(np.arange(n_total), "")
    total = importances.sum()
    return splits, (importances / total if total > 0 else importances)


def eight_sklearn_ccp(splits):
    """sklearn pruning path of the textbook eight-case tree (root a1 <= 2.5, entropy).

    sklearn picks the root among tied candidates by random_state, so search the first seed whose
    fitted tree has exactly the textbook splits.
    """
    for rs in range(100):
        clf = DecisionTreeClassifier(criterion="entropy", random_state=rs).fit(EIGHT_X, EIGHT_Y)
        if sk_splits(clf.tree_) == splits:
            path = clf.cost_complexity_pruning_path(EIGHT_X, EIGHT_Y)
            return {"alphas": path.ccp_alphas, "impurities": path.impurities}
    raise RuntimeError("no random_state reproduces the textbook eight-case tree")


def sk_splits(tree):
    """sklearn tree_ splits in preorder as {path, feature, threshold}."""
    out = []

    def walk(node, path):
        if tree.children_left[node] == -1:
            return
        out.append({"path": path, "feature": int(tree.feature[node]), "threshold": float(tree.threshold[node])})
        walk(tree.children_left[node], path + "L")
        walk(tree.children_right[node], path + "R")

    walk(0, "")
    return out


def build_textbook():
    speed = textbook_dataset(SPEED_COLUMNS, SPEED_TARGET)
    eight = textbook_dataset(EIGHT_COLUMNS, EIGHT_TARGET, numeric=("a1", "a2"))
    weather = textbook_dataset(WEATHER_COLUMNS, WEATHER_TARGET)

    eight_kinds = [f["kind"] for f in eight["features"]]
    right = [i for i, row in enumerate(eight["X"]) if row[0] > 2.5]  # rows 4..7
    eight_right = py_candidates([eight["X"][i] for i in right], [eight["y"][i] for i in right],
                                eight_kinds, "entropy", 2)
    splits, importances = grow_first_wins(eight["X"], eight["y"], eight_kinds, "entropy", 2)

    w_kinds = [f["kind"] for f in weather["features"]]
    sunny = [i for i, row in enumerate(weather["X"]) if row[0] == 0]
    outlook_child = py_candidates([weather["X"][i] for i in sunny], [weather["y"][i] for i in sunny],
                                  w_kinds, "entropy", 2)

    exercises = {
        "ex3": {"gini": impurity([6, 4], "gini"), "misclass": impurity([6, 4], "misclass")},
        "ex4": {
            "giniA": split_gain([5, 5], [[5, 4], [0, 1]], "gini"),
            "giniB": split_gain([5, 5], [[4, 1], [1, 4]], "gini"),
            "entropyA": split_gain([5, 5], [[5, 4], [0, 1]], "entropy"),
            "entropyB": split_gain([5, 5], [[4, 1], [1, 4]], "entropy"),
        },
        "ex8": [split_gain([2, 2], ch, "entropy") for ch in ([[2, 0], [0, 2]], [[1, 1], [1, 1]], [[2, 1], [0, 1]])],
    }
    return {
        "meta": META, "speed": speed, "eight": eight, "weather": weather,
        "eightRightChild": eight_right,
        "eightTree": {"splits": splits},
        "eightImportances": importances,
        "eightCcp": eight_sklearn_ccp(splits),
        "weatherOutlookChild": outlook_child,
        "exercises": exercises,
    }


# ---------------------------------------------------------------- tie detector (Spec 3.3)

class TieDetectorError(RuntimeError):
    """sklearn's chosen split is not a maximiser of the recomputed proxy: the reimplementation is wrong."""


def _entropy_bits(counts, w):
    h = 0.0
    for c in counts:
        if c > 0:
            p = c / w
            h -= p * (math.log(p) / math.log(2.0))
    return h


def proxy_improvement(sum_left, sum_right, criterion):
    """sklearn's proxy for the split choice (weighted class sums of both children)."""
    wl, wr = float(np.sum(sum_left)), float(np.sum(sum_right))
    if criterion == "gini":
        return float(np.sum(sum_left * sum_left)) / wl + float(np.sum(sum_right * sum_right)) / wr
    if criterion == "entropy":
        return -wl * _entropy_bits(sum_left, wl) - wr * _entropy_bits(sum_right, wr)
    raise ValueError(f"unsupported criterion {criterion}")


def node_candidates(X32, y, w, rows, n_classes, criterion, min_samples_leaf):
    """[(feature, threshold, proxy)] for one node with sklearn's float32 rules (BestSplitter)."""
    out = []
    for j in range(X32.shape[1]):
        order = rows[np.argsort(X32[rows, j], kind="stable")]
        v = X32[order, j]
        if v[-1] <= np.float32(v[0] + FEATURE_THRESHOLD):
            continue  # constant in the node
        onehot = np.zeros((len(order), n_classes))
        onehot[np.arange(len(order)), y[order]] = w[order]
        cum = np.cumsum(onehot, axis=0)
        total = cum[-1]
        n = len(order)
        for p in range(1, n):  # split between sorted positions p - 1 and p
            if v[p] <= np.float32(v[p - 1] + FEATURE_THRESHOLD):
                continue
            if p < min_samples_leaf or n - p < min_samples_leaf:
                continue
            a, b = float(v[p - 1]), float(v[p])
            t = a / 2.0 + b / 2.0
            if t == b or math.isinf(t):
                t = a
            out.append((j, t, proxy_improvement(cum[p - 1], total - cum[p - 1], criterion)))
    return out


def _close(a, b):
    return a == b or abs(a - b) <= TIE_RTOL * max(abs(a), abs(b))


def _node_rows(X32, w, tree):
    paths = tree.decision_path(X32).tocsc()
    keep = w > 0
    return [np.flatnonzero(paths[:, i].toarray().ravel().astype(bool) & keep) for i in range(tree.node_count)]


def _prepare(X, y, w):
    X32 = np.ascontiguousarray(X, dtype=np.float32)
    y = np.asarray(y, int)
    w = np.ones(len(y)) if w is None else np.asarray(w, float)
    return X32, y, w


def _check_node(X32, y, w, rows, tree, criterion, node, chosen, min_samples_leaf):
    """True if `node` is a tie node; TieDetectorError if `chosen` = (feature, threshold) is not an argmax."""
    cands = node_candidates(X32, y, w, rows, int(tree.n_classes[0]), criterion, min_samples_leaf)
    if not cands:
        raise TieDetectorError(f"node {node}: sklearn split {chosen} but no candidate")
    best = max(c[2] for c in cands)
    argmax = [(f, t) for f, t, q in cands if _close(q, best)]
    if chosen not in argmax:
        raise TieDetectorError(f"node {node}: sklearn split {chosen} not in argmax {argmax}")
    return len(argmax) >= 2


def check_node_choice(X, y, w, tree, criterion, node, feature, threshold, min_samples_leaf=1):
    """Check one node against an explicit (feature, threshold) choice (used to test the raise path)."""
    X32, y, w = _prepare(X, y, w)
    rows = _node_rows(X32, w, tree)[node]
    return _check_node(X32, y, w, rows, tree, criterion, node, (feature, float(threshold)), min_samples_leaf)


def find_tie_nodes(X, y, w, tree, criterion, min_samples_leaf=1):
    """Internal sklearn nodes whose proxy maximum is attained by >= 2 candidates (relative 1e-12).

    Raises TieDetectorError if sklearn's split at any internal node is not in the argmax set.
    """
    X32, y, w = _prepare(X, y, w)
    node_rows = _node_rows(X32, w, tree)
    ties = []
    for node in range(tree.node_count):
        if tree.children_left[node] == -1:
            continue  # leaves are never tie nodes
        chosen = (int(tree.feature[node]), float(tree.threshold[node]))
        if _check_node(X32, y, w, node_rows[node], tree, criterion, node, chosen, min_samples_leaf):
            ties.append(node)
    return ties


# ---------------------------------------------------------------- CART cases

def tree_params(criterion="gini", max_depth=None, min_samples_split=2, min_samples_leaf=1,
                min_impurity_decrease=0.0, ccp_alpha=0.0):
    return {"criterion": criterion, "maxDepth": max_depth, "minSamplesSplit": min_samples_split,
            "minSamplesLeaf": min_samples_leaf, "minImpurityDecrease": min_impurity_decrease,
            "ccpAlpha": ccp_alpha}


def sk_estimator(params, random_state=0):
    return DecisionTreeClassifier(
        criterion=params["criterion"], max_depth=params["maxDepth"],
        min_samples_split=params["minSamplesSplit"], min_samples_leaf=params["minSamplesLeaf"],
        min_impurity_decrease=params["minImpurityDecrease"], ccp_alpha=params["ccpAlpha"],
        random_state=random_state)


def make_grid(X, size=15):
    """size points per feature over [min - 0.5, max + 0.5]; first feature varies fastest."""
    X = np.asarray(X, float)
    axes = [np.linspace(X[:, j].min() - 0.5, X[:, j].max() + 0.5, size) for j in range(X.shape[1])]
    mesh = np.meshgrid(*axes, indexing="xy") if len(axes) == 2 else np.meshgrid(*axes, indexing="ij")
    return np.column_stack([m.ravel() for m in mesh])


def build_case(name, X, y, params, sample_weight=None, random_state=0):
    X = np.asarray(X, float)
    y = np.asarray(y, int)
    clf = sk_estimator(params, random_state).fit(X, y, sample_weight=sample_weight)
    t = clf.tree_
    w = np.ones(len(y)) if sample_weight is None else np.asarray(sample_weight, float)
    path = clf.cost_complexity_pruning_path(X, y, sample_weight=sample_weight)
    grid = make_grid(X)
    case = {"name": name, "X": X, "y": y, "nClasses": int(t.n_classes[0])}
    if sample_weight is not None:
        case["sampleWeight"] = np.asarray(sample_weight)
    case["params"] = params
    case["tieNodes"] = find_tie_nodes(X, y, w, t, params["criterion"], params["minSamplesLeaf"])
    case["sk"] = {
        "childrenLeft": t.children_left, "childrenRight": t.children_right, "feature": t.feature,
        "threshold": t.threshold, "nNodeSamples": t.n_node_samples,
        "weightedNNodeSamples": t.weighted_n_node_samples, "value": t.value[:, 0, :],
        "impurity": t.impurity, "importances": clf.feature_importances_,
        "ccpAlphas": path.ccp_alphas, "ccpImpurities": path.impurities,
        "grid": grid, "gridProba": clf.predict_proba(grid),
    }
    return case


def moons():
    return make_moons(150, noise=0.25, random_state=0)


def build_cart():
    Xm, ym = moons()
    Xc, yc = make_circles(120, noise=0.1, factor=0.5, random_state=1)
    counts = np.bincount(_generate_sample_indices(123, 120, 120), minlength=120)
    cases = [
        build_case("eight_rs1", EIGHT_X, EIGHT_Y, tree_params("entropy"), random_state=1),
        build_case("moons_default", Xm, ym, tree_params()),
        build_case("moons_depth4_entropy", Xm, ym, tree_params("entropy", max_depth=4)),
        build_case("moons_leaf7", Xm, ym, tree_params(min_samples_leaf=7)),
        build_case("moons_split25", Xm, ym, tree_params(min_samples_split=25)),
        build_case("moons_mid001", Xm, ym, tree_params(min_impurity_decrease=0.01)),
        build_case("moons_ccp002", Xm, ym, tree_params(ccp_alpha=0.02)),
        build_case("circles_weighted", Xc, yc, tree_params(), sample_weight=counts),
        build_case("xor4", [[0, 0], [0, 1], [1, 0], [1, 1]], [0, 1, 1, 0], tree_params()),
        build_case("dup_conflict", [[1, 0], [1, 0], [2, 0]], [0, 1, 1], tree_params()),
        build_case("float32_eps", [[1.0], [1.0000001192092896]], [0, 1], tree_params()),
    ]
    return {"meta": META, "cases": cases}


# ---------------------------------------------------------------- cross-validation

def stratified_test_folds(y, k):
    y = np.asarray(y, int)
    folds = np.full(len(y), -1)
    for i, (_, test) in enumerate(StratifiedKFold(k).split(np.zeros((len(y), 1)), y)):
        folds[test] = i
    assert (folds >= 0).all()
    return {"y": y, "k": k, "testFolds": folds}


def build_cv():
    X, y = moons()
    y23 = [2, 0, 1, 1, 0, 2, 2, 2, 1, 0, 0, 2, 1, 2, 0, 1, 2, 2, 0, 1, 2, 1, 0]
    folds = [stratified_test_folds([0] * 7 + [1] * 3, 3), stratified_test_folds(y23, 5),
             stratified_test_folds(y, 5)]

    params = tree_params(max_depth=3)
    res = cross_validate(sk_estimator(params), X, y, cv=5, return_train_score=True)
    base = tree_params()
    values = [1, 2, 3, 4]
    train, test = validation_curve(sk_estimator(base), X, y, param_name="max_depth", param_range=values, cv=5)
    return {
        "meta": META,
        "folds": folds,
        "cvScore": {"X": X, "y": y, "params": params, "k": 5,
                    "foldScores": res["test_score"], "trainScores": res["train_score"]},
        "validationCurve": {"X": X, "y": y, "base": base, "k": 5, "param": "maxDepth", "values": values,
                            "train": train, "test": test},
    }


def build_all():
    return {name: jsonable(obj) for name, obj in
            (("textbook", build_textbook()), ("cart", build_cart()), ("cv", build_cv()))}


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for name, obj in build_all().items():
        with open(OUT / f"{name}.json", "w", encoding="utf8", newline="\n") as f:
            json.dump(obj, f, separators=(",", ":"), allow_nan=False)
            f.write("\n")
        print("wrote", OUT / f"{name}.json")
