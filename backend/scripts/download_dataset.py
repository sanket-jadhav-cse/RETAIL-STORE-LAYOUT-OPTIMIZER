from io import BytesIO
from pathlib import Path
from urllib.request import urlopen
from zipfile import ZipFile

root = Path(__file__).resolve().parents[2] / "data/raw"
root.mkdir(parents=True, exist_ok=True)
with urlopen(
    "https://archive.ics.uci.edu/static/public/352/online+retail.zip", timeout=120
) as response:
    archive = ZipFile(BytesIO(response.read()))
    with archive.open("Online Retail.xlsx") as source:
        (root / "Online Retail.xlsx").write_bytes(source.read())
print("Downloaded UCI Online Retail.xlsx; CC BY 4.0, Chen (2015), DOI 10.24432/C5BW33")
