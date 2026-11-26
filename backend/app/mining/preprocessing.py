import re
from pathlib import Path

import numpy as np
import pandas as pd
from mlxtend.preprocessing import TransactionEncoder

REQUIRED = {"invoiceno", "stockcode", "quantity", "description"}


def identifier(value):
    if pd.isna(value):
        return ""
    return re.sub(r"^(\d+)\.0$", r"\1", str(value).strip()).upper()


def load(path: Path):
    if path.suffix.lower() == ".xlsx":
        return pd.read_excel(path, dtype={"InvoiceNo": str, "StockCode": str})
    if path.suffix.lower() == ".csv":
        return pd.read_csv(path, dtype=str, encoding="utf-8-sig")
    raise ValueError("Use CSV or XLSX")


def preprocess(frame: pd.DataFrame):
    frame = frame.copy()
    frame.columns = [re.sub(r"[\s_]", "", str(c)).lower() for c in frame.columns]
    if frame.columns.duplicated().any() or not REQUIRED.issubset(frame.columns):
        raise ValueError(
            "Required unique columns: InvoiceNo, StockCode, Description, Quantity"
        )
    summary = {"original_records": len(frame), "excluded": {}}
    frame["invoiceno"] = frame.invoiceno.map(identifier)
    frame["stockcode"] = frame.stockcode.map(identifier)
    frame["quantity"] = pd.to_numeric(frame.quantity, errors="coerce")
    for name, predicate in [
        ("missing_invoice", lambda f: f.invoiceno.eq("")),
        ("missing_product", lambda f: f.stockcode.eq("")),
        ("cancelled", lambda f: f.invoiceno.str.startswith("C")),
        ("invalid_quantity", lambda f: ~np.isfinite(f.quantity) | f.quantity.le(0)),
    ]:
        mask = predicate(frame)
        summary["excluded"][name] = int(mask.sum())
        frame = frame.loc[~mask].copy()
    # Only exact source duplicates are dropped; repeated product lines are collapsed later.
    dup = frame.duplicated()
    summary["excluded"]["exact_duplicates"] = int(dup.sum())
    frame = frame.loc[~dup].copy()
    frame["description"] = frame.description.fillna("").astype(str).str.strip()
    products = {}
    for code, group in frame.groupby("stockcode", sort=True):
        descriptions = group.description[group.description.ne("")]
        counts = descriptions.value_counts()
        products[code] = (
            sorted(counts[counts.eq(counts.max())].index)[0] if len(counts) else code
        )
    baskets = [
        sorted(set(group.stockcode))
        for _, group in frame.groupby("invoiceno", sort=True)
    ]
    summary.update(
        cleaned_records=len(frame),
        basket_count=len(baskets),
        product_count=len(products),
        repeated_product_lines=int(len(frame) - sum(map(len, baskets))),
        policy="Sequential exclusions; all positive-quantity invoices retained; customer ID and unit price not required; invoice products deduplicated.",
    )
    return baskets, products, summary


def encode(baskets):
    if not baskets or not any(baskets):
        return pd.DataFrame()
    encoder = TransactionEncoder()
    matrix = encoder.fit(baskets).transform(baskets, sparse=True).tocsc()
    return pd.DataFrame(
        {
            code: pd.arrays.SparseArray(
                matrix[:, i].toarray().ravel(), fill_value=False
            )
            for i, code in enumerate(encoder.columns_)
        }
    )
