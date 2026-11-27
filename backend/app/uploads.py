"""Bounded private upload parsing; parser runs in a time/memory limited child.

Only generated storage IDs are used on disk. The original source remains private;
DATA_DIR must be on a durable volume in deployment. No remote storage provisioned.
"""

import csv
import hashlib
import json
import os
import subprocess
import sys
import threading
import zipfile
from pathlib import Path

from app.config import settings
from fastapi import HTTPException

CANONICAL = [
    "InvoiceNo",
    "StockCode",
    "Quantity",
    "Description",
    "InvoiceDate",
    "UnitPrice",
    "Country",
]
ALIASES = {
    "InvoiceNo": {
        "invoiceno",
        "invoice",
        "invoiceid",
        "transactionid",
        "transactionno",
        "orderid",
    },
    "StockCode": {"stockcode", "productid", "productcode", "sku", "itemid"},
    "Quantity": {"quantity", "qty"},
    "Description": {"description", "productname", "itemname"},
    "InvoiceDate": {"invoicedate", "transactiondate", "orderdate"},
    "UnitPrice": {"unitprice", "price"},
    "Country": {"country"},
}
UPLOAD_SLOT = threading.BoundedSemaphore(1)
MAX_COLUMNS = 40
MAX_CELL = 8192


def normalize(value):
    return "".join(c for c in str(value).lower() if c not in " _-")


def suggest_mapping(headers):
    result = {}
    for target, aliases in ALIASES.items():
        matches = [h for h in headers if normalize(h) in aliases]
        if len(matches) == 1:
            result[target] = matches[0]
    return result


def column_mapping(headers, mapping):
    if not isinstance(mapping, dict) or set(mapping) - set(CANONICAL):
        raise ValueError("Map only supported canonical columns")
    mapping = {k: v for k, v in mapping.items() if v}
    if any(not isinstance(v, str) or v not in headers for v in mapping.values()):
        raise ValueError("A mapped column is unavailable in this file")
    if len(set(mapping.values())) != len(mapping):
        raise ValueError("Each source column can be mapped only once")
    if any(k not in mapping for k in CANONICAL[:3]):
        raise ValueError("Map InvoiceNo, StockCode and Quantity before processing")
    return mapping


def file_rows(path, extension):
    if extension == "csv":
        stream = path.open(encoding="utf-8-sig", newline="")
        try:
            sample = stream.read(65536)
            if not sample.strip() or "\x00" in sample:
                raise ValueError("Use a non-empty UTF-8 CSV file")
            stream.seek(0)
            try:
                dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
            except csv.Error:
                dialect = csv.excel
            csv.field_size_limit(MAX_CELL)
            yield from csv.reader(stream, dialect=dialect, strict=True)
        finally:
            stream.close()
    else:
        import defusedxml  # noqa: F401  # Enables openpyxl's safe XML parser.

        with zipfile.ZipFile(path) as archive:
            entries = archive.infolist()
            if len(entries) > 1000 or sum(e.file_size for e in entries) > 120 * 1024**2:
                raise ValueError("Workbook expands beyond the 120 MiB parsing limit")
            if any("vbaProject" in e.filename or e.flag_bits & 1 for e in entries):
                raise ValueError("Macro-enabled or encrypted workbooks are unsupported")
        from openpyxl import load_workbook

        workbook = load_workbook(
            path, read_only=True, data_only=False, keep_links=False
        )
        try:
            if len(workbook.sheetnames) != 1:
                raise ValueError("Use a workbook with one transaction worksheet")
            sheet = workbook.active
            if (sheet.max_column or 0) > MAX_COLUMNS or (
                sheet.max_row or 0
            ) > settings.upload_max_rows + 1:
                raise ValueError("Workbook exceeds the row or column limit")
            for row in sheet.iter_rows():
                if any(c.data_type == "f" for c in row):
                    raise ValueError(
                        "Formula cells are unsupported; export values before uploading"
                    )
                yield [c.value for c in row]
        finally:
            workbook.close()


def parse_file(path, extension, mapping, output, preview=False):
    rows = file_rows(path, extension)
    try:
        first = next(rows, None)
        if not first:
            raise ValueError("The file is empty")
        headers = [str(c).strip() if c is not None else "" for c in first]
        if (
            not headers
            or len(headers) > MAX_COLUMNS
            or any(not h or len(h) > 200 for h in headers)
        ):
            raise ValueError(
                "Use 1–40 named columns, with headers up to 200 characters"
            )
        normalized = [normalize(h) for h in headers]
        if len(normalized) != len(set(normalized)):
            raise ValueError("Duplicate column headers are ambiguous; rename them")
        records = []
        limit = 20 if preview else settings.upload_max_rows
        for row in rows:
            if not any(v is not None and str(v).strip() for v in row):
                continue
            if len(row) != len(headers):
                raise ValueError(
                    "A row has a different number of columns than the header"
                )
            if any(len(str(v)) > MAX_CELL for v in row if v is not None):
                raise ValueError("A cell exceeds the 8192-character limit")
            if len(records) >= limit:
                if preview:
                    break
                raise ValueError(f"File exceeds the {limit:,}-row processing limit")
            records.append(row)
        if not records:
            raise ValueError("The file contains headers but no transaction rows")
        if preview:
            result = dict(
                columns=headers,
                sample=[
                    [str(v) if v is not None else "" for v in r] for r in records[:8]
                ],
                mapping=suggest_mapping(headers),
                sample_limit=8,
            )
        else:
            import pandas as pd
            from app.mining.preprocessing import preprocess

            mapping = column_mapping(headers, mapping)
            frame = pd.DataFrame(records, columns=headers)
            frame = frame[list(mapping.values())].rename(
                columns={v: k for k, v in mapping.items()}
            )
            baskets, products, summary = preprocess(frame)
            if len(baskets) < 2:
                raise ValueError("At least two valid transaction baskets are required")
            if len(baskets) > 100000 or len(products) > 10000:
                raise ValueError(
                    "Use at most 100,000 baskets and 10,000 products per upload"
                )
            if any(
                len(code) > 200 or len(label) > 1000 for code, label in products.items()
            ):
                raise ValueError(
                    "Product identifiers must fit 200 characters and descriptions 1000 characters"
                )
            with output.with_suffix(".baskets").open("w") as stream:
                json.dump(baskets, stream)
            result = dict(products=products, summary=summary)
        output.write_text(json.dumps(result, default=str))
    finally:
        rows.close()


def parse_isolated(path, extension, mapping, output, preview=False):
    command = [
        sys.executable,
        "-m",
        "app.uploads",
        str(path),
        extension,
        json.dumps(mapping),
        str(output),
        "preview" if preview else "process",
    ]
    try:
        result = subprocess.run(
            command,
            timeout=settings.upload_timeout_seconds,
            capture_output=True,
            env={**os.environ, "OPENBLAS_NUM_THREADS": "1", "OMP_NUM_THREADS": "1"},
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(
            422, "File processing timed out; split the file into smaller datasets"
        ) from None
    if result.returncode or not output.is_file():
        raise HTTPException(422, "File exceeded parsing resources or could not be read")
    data = json.loads(output.read_text())
    if "error" in data:
        raise HTTPException(422, data["error"])
    return data


def storage_identity(owner, source_hash, mapping):
    return hashlib.sha256(
        f"{owner}:{source_hash}:{json.dumps(mapping, sort_keys=True)}".encode()
    ).hexdigest()


if __name__ == "__main__":
    import resource

    resource.setrlimit(resource.RLIMIT_AS, (settings.upload_memory_mb * 1024**2,) * 2)
    source, extension, raw_mapping, target, mode = sys.argv[1:]
    try:
        parse_file(
            Path(source),
            extension,
            json.loads(raw_mapping),
            Path(target),
            mode == "preview",
        )
    except (ValueError, UnicodeError, csv.Error, zipfile.BadZipFile, KeyError, OSError):
        # Only our own validation messages may cross the process boundary.
        exc = sys.exception()
        safe = (
            str(exc)
            if type(exc) is ValueError
            else "Unable to parse file; use a valid UTF-8 CSV or unencrypted XLSX"
        )
        Path(target).write_text(json.dumps({"error": safe[:300]}))
