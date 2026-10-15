"""Checks the golden JSON files in tests/golden/ against scripts/make_golden.py and the textbook."""
import json
import sys
from pathlib import Path

import numpy as np
import pytest
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import cross_validate, validation_curve
from sklearn.tree import DecisionTreeClassifier

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

import make_golden  # noqa: E402

GOLDEN = ROOT / "tests" / "golden"
NAMES = ["textbook", "cart", "cv", "forest"]


@pytest.fixture(scope="module")
def built():
    return make_golden.build_all()


def load(name):
    with open(GOLDEN / f"{name}.json", encoding="utf8") as f:
        return json.load(f)


def _is_numeric(a):
    if isinstance(a, list):
        return all(_is_numeric(v) for v in a)
    if a is None or isinstance(a, (bool, str, dict)):
        return False
    try:
        np.asarray(a, float)
        return True
    except (TypeError, ValueError):
        return False


def assert_same(a, b, rtol=1e-12, atol=0.0, path=""):
    """Structure (keys, lengths, strings, null/bool) exact; numbers within rtol."""
    if isinstance(a, dict):
        assert isinstance(b, dict) and list(a.keys()) == list(b.keys()), path
        for k in a:
            if k == "meta":
                continue
            assert_same(a[k], b[k], rtol, atol, f"{path}/{k}")
    elif isinstance(a, str) or isinstance(b, str):
        assert a == b, path
    elif isinstance(a, bool) or isinstance(b, bool) or a is None or b is None:
        assert a == b and type(a) is type(b), path
    elif isinstance(a, list) and not _is_numeric(a):
        assert isinstance(b, list) and len(a) == len(b), path
        for i, (u, v) in enumerate(zip(a, b)):
            assert_same(u, v, rtol, atol, f"{path}[{i}]")
    else:
        assert isinstance(b, (list, int, float)) and not isinstance(b, bool), path
        u, v = np.asarray(a, float), np.asarray(b, float)
        assert u.shape == v.shape, path
        assert np.allclose(u, v, rtol=rtol, atol=atol), path


@pytest.mark.parametrize("name", NAMES)
def test_committed_files_match_script(built, name):
    assert_same(built[name], load(name), rtol=1e-12, path=name)


def test_build_all_produces_exactly_the_committed_files(built):
    assert sorted(built) == sorted(NAMES)
    assert sorted(p.stem for p in GOLDEN.glob("*.json")) == sorted(NAMES)
    for name in NAMES:
        meta = load(name)["meta"]
        assert meta["generated_by"] == "scripts/make_golden.py"
        assert meta["sklearn"] == "1.5.0"


def pairs(cands):
    return [(c["childImpurity"], c["gain"]) for c in cands]


def test_textbook_numbers():
    g = load("textbook")

    speed = g["speed"]["rootCandidates"]["entropy"]
    names = [f["name"] for f in g["speed"]["features"]]
    gain = {names[c["feature"]]: c["gain"] for c in speed}
    assert len(speed) == 3
    assert gain["Speed_Limit"] == pytest.approx(1.0, abs=1e-12)
    assert gain["Grade"] == pytest.approx(0.311278, abs=1e-6)
    assert gain["Bumpiness"] == pytest.approx(0.0, abs=1e-12)

    eight = g["eight"]["rootCandidates"]["entropy"]
    assert [(c["feature"], c["value"]) for c in eight] == [(0, 1.5), (0, 2.5), (0, 3.5), (1, 1.5), (1, 2.5), (1, 3.5)]
    for c in eight:
        assert c["childImpurity"] + c["gain"] == pytest.approx(0.954434, abs=1e-6)
    expected = [(0.7500, 0.2044), (0.4056, 0.5488), (0.4875, 0.4669),
                (0.8621, 0.0924), (0.4056, 0.5488), (0.4875, 0.4669)]
    assert np.allclose(pairs(eight), expected, rtol=0, atol=1e-4)
    assert np.allclose(pairs(g["eightRightChild"]), [(0.5, 0.3113), (0, 0.8113), (0.5, 0.3113)], rtol=0, atol=1e-4)
    assert g["eightTree"]["splits"] == [
        {"path": "", "feature": 0, "threshold": 2.5},
        {"path": "R", "feature": 1, "threshold": 2.5},
    ]
    assert np.allclose(g["eightImportances"], [0.5750, 0.4250], rtol=0, atol=1e-4)
    assert np.allclose(g["eightCcp"]["alphas"], [0, 0.405639, 0.548795], rtol=0, atol=1e-6)
    assert g["eight"]["multiwayGain"]["entropy"] == [None, None]

    weather = g["weather"]
    assert weather["classNames"] == ["no", "yes"]
    assert [f["name"] for f in weather["features"]] == ["outlook", "temperature", "humidity", "wind"]
    assert len(weather["X"]) == 14
    assert weather["X"][13] == [2, 1, 0, 1] and weather["y"][13] == 0  # D14 rain mild high strong -> no
    assert np.allclose(weather["multiwayGain"]["entropy"], [0.246750, 0.029223, 0.151836, 0.048127], rtol=0, atol=1e-6)
    # two categories in a node -> one candidate (smaller code), no mirror candidates
    per_feature = [sum(c["feature"] == j for c in weather["rootCandidates"]["gini"]) for j in range(4)]
    assert per_feature == [3, 3, 1, 1]
    child = g["weatherOutlookChild"]
    assert sum(c["feature"] == 0 for c in child) == 0
    assert [c["value"] for c in child if c["feature"] in (2, 3)] == [0, 0]

    ex = g["exercises"]
    assert ex["ex3"]["gini"] == pytest.approx(0.48, abs=1e-12)
    assert ex["ex3"]["misclass"] == pytest.approx(0.4, abs=1e-12)
    assert np.allclose([ex["ex4"]["giniA"], ex["ex4"]["giniB"]], [0.0556, 0.18], rtol=0, atol=1e-4)
    assert np.allclose([ex["ex4"]["entropyA"], ex["ex4"]["entropyB"]], [0.1080, 0.2781], rtol=0, atol=1e-4)
    assert np.allclose(ex["ex8"], [1, 0, 0.3113], rtol=0, atol=1e-4)


def cases():
    return {c["name"]: c for c in load("cart")["cases"]}


def test_tie_detector():
    c = cases()
    assert c["eight_rs1"]["tieNodes"] == [0]
    assert c["eight_rs1"]["sk"]["feature"][0] == 1
    assert 0 in c["xor4"]["tieNodes"]
    assert c["moons_default"]["tieNodes"] == []


def test_cart_cases_complete():
    c = cases()
    assert list(c) == ["eight_rs1", "moons_default", "moons_depth4_entropy", "moons_leaf7", "moons_split25",
                       "moons_mid001", "moons_ccp002", "circles_weighted", "xor4", "dup_conflict", "float32_eps"]
    assert len(c["float32_eps"]["sk"]["childrenLeft"]) == 1
    assert c["dup_conflict"]["tieNodes"] == []
    assert "sampleWeight" in c["circles_weighted"] and 0 in c["circles_weighted"]["sampleWeight"]
    for case in c.values():
        sk = case["sk"]
        assert sk["ccpAlphas"][0] == 0
        assert len(sk["grid"]) == len(sk["gridProba"])


def test_tie_nodes_agree_with_seed_dependence():
    """Without tie nodes the sklearn tree must not depend on random_state; the tie cases do."""
    for case in load("cart")["cases"]:
        X, y = np.asarray(case["X"]), np.asarray(case["y"])
        w = case.get("sampleWeight")
        p = case["params"]
        trees = set()
        for rs in range(20):
            clf = DecisionTreeClassifier(
                criterion=p["criterion"], max_depth=p["maxDepth"], min_samples_split=p["minSamplesSplit"],
                min_samples_leaf=p["minSamplesLeaf"], min_impurity_decrease=p["minImpurityDecrease"],
                ccp_alpha=p["ccpAlpha"], random_state=rs).fit(X, y, sample_weight=w)
            trees.add(json.dumps(make_golden.sk_splits(clf.tree_)))
        if case["tieNodes"] == []:
            assert len(trees) == 1, case["name"]
        elif case["name"] in ("eight_rs1", "xor4"):
            assert len(trees) > 1, case["name"]


def test_tie_detector_rejects_split_outside_argmax():
    """The detector must raise when the fitted split is not a maximiser of the given criterion."""
    X, y = make_golden.EIGHT_X, make_golden.EIGHT_Y
    w = np.ones(len(y))
    clf = DecisionTreeClassifier(criterion="entropy", random_state=0).fit(X, y)
    tree = clf.tree_
    # pretend sklearn chose a1 <= 1.5 at the root (proxy below the maximum)
    with pytest.raises(make_golden.TieDetectorError):
        make_golden.check_node_choice(X, y, w, tree, "entropy", node=0, feature=0, threshold=1.5)


def test_cv_seed_invariant():
    g = load("cv")
    X, y = np.asarray(g["cvScore"]["X"]), np.asarray(g["cvScore"]["y"])
    vc = g["validationCurve"]
    for rs in range(50):
        res = cross_validate(DecisionTreeClassifier(max_depth=3, random_state=rs), X, y, cv=5, return_train_score=True)
        assert res["test_score"].tolist() == g["cvScore"]["foldScores"], rs
        assert res["train_score"].tolist() == g["cvScore"]["trainScores"], rs
        train, test = validation_curve(DecisionTreeClassifier(random_state=rs), X, y,
                                       param_name="max_depth", param_range=[1, 2, 3, 4], cv=5)
        assert train.tolist() == vc["train"], rs
        assert test.tolist() == vc["test"], rs


def test_forest_bootstrap_counts_reproduce_estimators():
    """A plain tree fitted with a forest tree's bootstrap counts as sample_weight is that tree."""
    X, y = make_golden.forest_data()
    rf = RandomForestClassifier(n_estimators=25, max_features=None, bootstrap=True, oob_score=True,
                                random_state=7).fit(X, y)
    g = load("forest")["exact"]
    assert len(g["bootstrapCounts"]) == len(rf.estimators_) == 25
    for i, est in enumerate(rf.estimators_):
        counts = make_golden.bootstrap_counts(est, len(y))
        assert counts.tolist() == g["bootstrapCounts"][i], i
        assert counts.sum() == len(y), i
        ref = DecisionTreeClassifier(random_state=est.random_state).fit(X, y, sample_weight=counts).tree_
        t = est.tree_
        assert make_golden.sk_splits(ref) == make_golden.sk_splits(t), i
        assert np.array_equal(ref.n_node_samples, t.n_node_samples), i
        assert np.array_equal(ref.value, t.value), i


def test_forest_golden_shape():
    g = load("forest")
    ex, st = g["exact"], g["stat"]
    assert ex["params"]["nEstimators"] == 25 and ex["params"]["maxFeatures"] is None
    assert "ccpAlpha" not in ex["params"]["tree"]
    assert len(ex["X"]) == len(ex["y"]) == 200
    assert len(ex["grid"]) == len(ex["gridProba"])
    # every row is out of bag for at least one of the 25 trees, so sklearn's OOB score is exact
    covered = np.zeros(200, bool)
    for c in ex["bootstrapCounts"]:
        covered |= np.asarray(c) == 0
    assert covered.all()
    for t in ex["trees"]:
        assert t["childrenLeft"][0] != -1
        assert all(t["childrenLeft"][node] != -1 for node in t["tieNodes"])
    assert st["seeds"] == 20 and st["params"]["maxFeatures"] == 1 and st["params"]["nEstimators"] == 50
    assert 0.5 < st["oobMean"] < 1 and st["oobSd"] >= 0
