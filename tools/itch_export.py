#!/usr/bin/env python3
"""Deterministic, allowlisted PARADOX HTML5 ZIP. Does not publish anything.

Pins the seven public game assets to known Git blob identities; refuses
symlinks, changed content, unknown assets, and existing output files.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import sys
import zipfile

SOURCE_COMMIT = "e4645647488f8ef3f9e04cdcb652c88e542f9e92"
ASSETS = {
    "app.js": (14881, "29e41290e1f2e12dc4d2ac85ef6c32fd3eefa8d4"),
    "data/cases.json": (17913, "e88d4ea654665f17eba5e1670b089753d83fda4d"),
    "favicon.svg": (353, "4b656a23881d268bd8faa10fc7d8098a888dd95a"),
    "index.html": (8804, "2cff35dc744fc8b53691217e6501c8a4e24f2f34"),
    "manifest.webmanifest": (406, "2e3e82acfa73f2606814af240334029b2f451817"),
    "privacy.html": (3065, "9adcb988104fb8f752db071db1209010f1859688"),
    "style.css": (20252, "68a1519bfae62eeb88b569253f09ea5b9248c027"),
}


def blob_id(data: bytes) -> str:
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()


def verified_assets(root: Path) -> dict[str, bytes]:
    root = root.resolve(strict=True)
    assets = {}
    for relative, (size, expected) in ASSETS.items():
        path = root / relative
        if path.is_symlink() or not path.is_file() or not path.resolve().is_relative_to(root):
            raise ValueError("Invalid, missing, or linked asset: " + relative)
        data = path.read_bytes()
        if len(data) != size or blob_id(data) != expected:
            raise ValueError("Source mismatch for " + relative)
        assets[relative] = data
    html = assets["index.html"].decode("utf-8")
    js = assets["app.js"].decode("utf-8")
    for asset in ("favicon.svg", "manifest.webmanifest", "style.css", "app.js"):
        if '"' + asset + '"' not in html:
            raise ValueError("Broken HTML asset reference: " + asset)
    if 'fetch("./data/cases.json"' not in js:
        raise ValueError("Broken case data reference")
    cases = json.loads(assets["data/cases.json"].decode("utf-8"))
    if not isinstance(cases, list) or len(cases) != 12 or any(
        not isinstance(x, dict) or not isinstance(x.get("clues"), list)
        or len(x["clues"]) != 6 for x in cases
    ):
        raise ValueError("Expected twelve six-clue fictional cases")
    return assets


def zip_bytes(assets: dict[str, bytes]) -> bytes:
    archive_data = io.BytesIO()
    with zipfile.ZipFile(archive_data, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for name in sorted(assets):
            if name.startswith("/") or ".." in Path(name).parts:
                raise ValueError("Unsafe archive path")
            metadata = zipfile.ZipInfo(name, (2026, 11, 13, 0, 0, 0))
            metadata.compress_type = zipfile.ZIP_DEFLATED
            metadata.create_system = 3
            metadata.external_attr = (0o100644 << 16)
            z.writestr(metadata, assets[name], compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    return archive_data.getvalue()


def export(root: Path, destination: Path) -> dict:
    if destination.exists():
        raise FileExistsError("Refusing to overwrite existing game ZIP: " + str(destination))
    assets = verified_assets(root)
    output = zip_bytes(assets)
    with zipfile.ZipFile(io.BytesIO(output)) as z:
        if z.testzip() is not None or set(z.namelist()) != set(ASSETS):
            raise ValueError("ZIP integrity failure")
        for name, contents in assets.items():
            if z.read(name) != contents:
                raise ValueError("ZIP byte mismatch for " + name)
    destination.write_bytes(output)
    return {"source_commit": SOURCE_COMMIT, "files": len(ASSETS), "zip_bytes": len(output),
            "zip_sha256": hashlib.sha256(output).hexdigest(), "published": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, default=Path("."))
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    receipt = export(args.source_dir, args.out)
    print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError) as error:
        print(type(error).__name__ + ": " + str(error), file=sys.stderr)
        sys.exit(1)
