"""Review old upload remnants. Dry run by default; never removes referenced data."""

import argparse
import re
import shutil
import time

from app.config import MaintenanceSession, settings
from app.models import Dataset
from sqlalchemy import select


def candidates(directory, referenced, cutoff):
    for item in directory.glob(".upload-*"):
        if item.is_dir() and not item.is_symlink() and item.stat().st_mtime < cutoff:
            yield item
    for item in (directory / "sources").glob("*"):
        if item.is_symlink() or not re.fullmatch(
            r"[0-9a-f]{64}\.(csv|xlsx)", item.name
        ):
            continue
        checksum = item.stem
        if checksum not in referenced and item.stat().st_mtime < cutoff:
            yield item
            basket = directory / f"{checksum}.json"
            if (
                basket.is_file()
                and not basket.is_symlink()
                and basket.stat().st_mtime < cutoff
            ):
                yield basket


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Remove only reviewed, unreferenced remnants older than 24 hours",
    )
    args = parser.parse_args()
    with MaintenanceSession() as session:
        referenced = set(session.scalars(select(Dataset.checksum)))
        for item in candidates(settings.data_dir, referenced, time.time() - 86400):
            print(
                ("Removing " if args.apply else "Would remove ")
                + str(item.relative_to(settings.data_dir))
            )
            if args.apply:
                if item.is_dir():
                    shutil.rmtree(item)
                else:
                    item.unlink(missing_ok=True)
