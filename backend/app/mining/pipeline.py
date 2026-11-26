import math
import time

from app.mining.preprocessing import encode
from mlxtend.frequent_patterns import association_rules, fpgrowth

MAX_RESULTS = 100_000


def recommend(rules):
    pairs = {}
    for r in rules:
        if len(r["antecedent"]) != 1 or len(r["consequent"]) != 1:
            continue
        a, b = r["antecedent"][0], r["consequent"][0]
        if a == b:
            continue
        lo, hi = sorted((a, b))
        pair = pairs.setdefault(
            (lo, hi),
            dict(
                product_a=lo,
                product_b=hi,
                support=r["support"],
                lift=r["lift"],
                confidence_a_b=None,
                confidence_b_a=None,
            ),
        )
        pair["confidence_a_b" if a == lo else "confidence_b_a"] = r["confidence"]
    result = sorted(
        pairs.values(),
        key=lambda p: (
            -p["lift"],
            -p["support"],
            -max(p["confidence_a_b"] or 0, p["confidence_b_a"] or 0),
            p["product_a"],
            p["product_b"],
        ),
    )
    for rank, pair in enumerate(result, 1):
        pair["rank"] = rank
        pair["rationale"] = (
            f"Co-purchased in {pair['support']:.1%} of eligible baskets; lift {pair['lift']:.2f}. "
            "Review merchandising feasibility. Missing confidence means that direction did not qualify."
        )
    return result


def mine(baskets, min_support=0.02, min_confidence=0.5, min_lift=1, max_itemset_size=3):
    if not all(math.isfinite(v) for v in (min_support, min_confidence, min_lift)):
        raise ValueError("Thresholds must be finite")
    if not 0 < min_support <= 1 or not 0 < min_confidence <= 1 or min_lift < 0:
        raise ValueError("Invalid thresholds")
    if max_itemset_size is not None and (
        isinstance(max_itemset_size, bool)
        or not isinstance(max_itemset_size, int)
        or not 1 <= max_itemset_size <= 8
    ):
        raise ValueError("Maximum itemset size must be 1–8 or None")
    started = time.perf_counter()
    matrix = encode(baskets)
    if matrix.empty:
        return dict(
            itemsets=[],
            rules=[],
            adjacencies=[],
            elapsed_seconds=time.perf_counter() - started,
        )
    frequent = fpgrowth(
        matrix, min_support=min_support, use_colnames=True, max_len=max_itemset_size
    )
    if len(frequent) > MAX_RESULTS:
        raise ValueError("Too many itemsets; increase minimum support")
    itemsets = sorted(
        [
            dict(items=sorted(row.itemsets), support=float(row.support))
            for row in frequent.itertuples()
        ],
        key=lambda r: (-r["support"], r["items"]),
    )
    rules = []
    if len(frequent) and any(len(x) > 1 for x in frequent.itemsets):
        table = association_rules(
            frequent,
            num_itemsets=len(baskets),
            metric="confidence",
            min_threshold=min_confidence,
        )
        table = table[table.lift.ge(min_lift)]
        if len(table) > MAX_RESULTS:
            raise ValueError("Too many rules; increase thresholds")
        for row in table.itertuples():
            if all(math.isfinite(x) for x in (row.support, row.confidence, row.lift)):
                rules.append(
                    dict(
                        antecedent=sorted(row.antecedents),
                        consequent=sorted(row.consequents),
                        support=float(row.support),
                        confidence=float(row.confidence),
                        lift=float(row.lift),
                    )
                )
    rules.sort(
        key=lambda r: (
            -r["lift"],
            -r["support"],
            -r["confidence"],
            r["antecedent"],
            r["consequent"],
        )
    )
    return dict(
        itemsets=itemsets,
        rules=rules,
        adjacencies=recommend(rules),
        elapsed_seconds=time.perf_counter() - started,
    )
