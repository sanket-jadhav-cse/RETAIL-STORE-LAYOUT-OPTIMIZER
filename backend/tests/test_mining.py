import math

import pandas as pd
import pytest
from app.mining.pipeline import mine, recommend
from app.mining.preprocessing import encode, preprocess


def baskets():
    return [["A", "B"]] * 20 + [["A"]] * 10 + [["B"]] * 20 + [["C"]] * 50


def test_independent_metrics_and_direction():
    result = mine(baskets(), 0.1, 0.4, 1, 2)
    ab = next(r for r in result["rules"] if r["antecedent"] == ["A"])
    ba = next(r for r in result["rules"] if r["antecedent"] == ["B"])
    assert ab["support"] == pytest.approx(0.2)
    assert ab["confidence"] == pytest.approx(2 / 3)
    assert ba["confidence"] == pytest.approx(0.5)
    assert ab["lift"] == pytest.approx(5 / 3)
    pair = result["adjacencies"][0]
    assert pair["confidence_a_b"] == pytest.approx(2 / 3)
    assert pair["confidence_b_a"] == pytest.approx(0.5)
    one_way = mine(baskets(), 0.2, 0.6, 1, 2)["adjacencies"][0]
    assert one_way["confidence_b_a"] is None
    assert mine(baskets(), 0.21, 0.4, 1, 2)["adjacencies"] == []
    assert result == {
        **mine(baskets(), 0.1, 0.4, 1, 2),
        "elapsed_seconds": result["elapsed_seconds"],
    }


def test_dirty_data():
    data = pd.DataFrame(
        [
            ["1.0", "A", "Apple", 2],
            ["1", "A", "Apple", 3],
            ["1", "B", "Bread", 1],
            [None, "A", "Apple", 1],
            ["2", None, "Apple", 1],
            ["C3", "A", "Apple", 1],
            ["4", "A", "Apple", -1],
            ["5", "A", "Apple", "bad"],
            ["6", "A", None, float("inf")],
            ["7", "B", None, 1],
            ["7", "B", None, 1],
        ],
        columns=["InvoiceNo", "StockCode", "Description", "Quantity"],
    )
    cleaned, products, quality = preprocess(data)
    assert cleaned == [["A", "B"], ["B"]]
    assert products == {"A": "Apple", "B": "Bread"}
    assert quality["original_records"] == 11
    assert quality["cleaned_records"] == 4
    assert quality["repeated_product_lines"] == 1
    assert quality["excluded"] == dict(
        missing_invoice=1,
        missing_product=1,
        cancelled=1,
        invalid_quantity=3,
        exact_duplicates=1,
    )
    matrix = encode(cleaned)
    assert matrix.shape == (2, 2)
    assert matrix["A"].sum() == 1
    assert all(dtype.subtype.kind == "b" for dtype in matrix.dtypes)


def test_validation_empty():
    with pytest.raises(ValueError):
        preprocess(pd.DataFrame({"InvoiceNo": []}))
    for args in [
        (0, 0.5, 1),
        (1.1, 0.5, 1),
        (0.1, 0, 1),
        (0.1, 1.1, 1),
        (0.1, 0.5, -1),
        (math.nan, 0.5, 1),
        (0.1, 0.5, math.inf),
    ]:
        with pytest.raises(ValueError):
            mine([], *args)
    with pytest.raises(ValueError):
        mine([], max_itemset_size=0)
    assert mine([])["rules"] == []
    assert mine([["A"]])["adjacencies"] == []
    assert recommend([]) == []
    assert encode([]).empty


def test_ranking_deduplication():
    rules = [
        dict(antecedent=[a], consequent=[b], support=0.2, confidence=0.5, lift=2)
        for a, b in [("B", "A"), ("A", "B"), ("A", "C")]
    ]
    pairs = recommend(rules)
    assert [(r["product_a"], r["product_b"]) for r in pairs] == [("A", "B"), ("A", "C")]
    assert [r["rank"] for r in pairs] == [1, 2]
