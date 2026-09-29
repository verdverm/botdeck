#!/usr/bin/env python3
"""Capture raw HTML (and all linked images) for the RPG Site FF1 guide set.

Everything fetched lives under ./raw/ so this directory is a self-contained
snapshot of the source. Processing to markdown is done by process.py.

Usage: crawl.py [raw_dir]      (default raw_dir = ./raw relative to this file)
"""
import os
import re
import json
import sys
import hashlib
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "raw")
PAGES = os.path.join(RAW, "pages")
IMAGES = os.path.join(RAW, "images")

UA = {"User-Agent": "Mozilla/5.0"}

# Feature pages to capture. The walkthrough (11508) is the "main" guide;
# the rest are the "Other Final Fantasy 1 Guides" listed after its ToC.
FEATURES = {
    "11508": "final-fantasy-1-walkthrough-where-to-go-dungeon-maps-ff1-step-by-step-guide",
    "11509": "final-fantasy-job-classes-ff1-character-class-list-and-best-team--party-options",
    "11510": "final-fantasy-job-upgrade-how-to-change-class-to-knight-master-ninja-and-wizard",
    "11511": "final-fantasy-magic-list-all-ff1-spells-their-effects--how-to-get-more-magic",
    "11513": "final-fantasy-weapons-ff1-best-weapons-weapon-list--locations",
    "11518": "final-fantasy-maps-world-dungeon--town-maps-for-ff1",
    "11519": "final-fantasy-bosses-guide-how-to-beat-every-ff1-boss-battle",
    "11520": "final-fantasy-1-character-names-ff1-party-member-name-suggestions",
}

IMG_URL_RE = re.compile(
    r'https://(?:images|assets)\.rpgsite\.net/[^\s"\'<>)]+?\.(?:jpg|jpeg|png|webp|gif)',
    re.I,
)


def fetch_text(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8", "replace"), r.geturl()


def capture_page(num, slug):
    url = f"https://www.rpgsite.net/feature/{num}-{slug}"
    body, final = fetch_text(url)
    os.makedirs(PAGES, exist_ok=True)
    with open(os.path.join(PAGES, f"{num}.html"), "w", encoding="utf-8") as f:
        f.write(body)
    print(f"page {num}: {len(body)} bytes (final {final})")
    return body


def img_filename(url):
    """Stable filename for an image url; dedups same-basename collisions by hash."""
    base = os.path.basename(url.split("?")[0])
    base = re.sub(r"[^A-Za-z0-9._-]", "_", base)
    if not base.lower().endswith((".jpg", ".jpeg", ".png", ".webp", ".gif")):
        base += ".jpg"
    if base in _taken_names and _taken_names[base] != url:
        h = hashlib.sha1(url.encode()).hexdigest()[:8]
        root, ext = os.path.splitext(base)
        base = f"{root}-{h}{ext}"
    _taken_names[base] = url
    return base


_taken_names = {}


def capture_images(body):
    manifest = _load_manifest()
    urls = set(m.group(0) for m in IMG_URL_RE.finditer(body))
    for url in urls:
        if url in manifest:
            continue
        fn = img_filename(url)
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
        except Exception as e:  # noqa
            print(f"  ! img fail {url}: {e}", file=sys.stderr)
            continue
        os.makedirs(IMAGES, exist_ok=True)
        with open(os.path.join(IMAGES, fn), "wb") as f:
            f.write(data)
        manifest[url] = fn
    _save_manifest(manifest)
    return manifest


def _load_manifest():
    p = os.path.join(IMAGES, "manifest.json")
    if os.path.exists(p):
        return json.load(open(p, encoding="utf-8"))
    return {}


def _save_manifest(m):
    os.makedirs(IMAGES, exist_ok=True)
    json.dump(m, open(os.path.join(IMAGES, "manifest.json"), "w",
                      encoding="utf-8"), indent=2, sort_keys=True)


def main():
    all_bodies = {}
    for num, slug in FEATURES.items():
        body = capture_page(num, slug)
        all_bodies[num] = body
    # gather images across every captured page
    for body in all_bodies.values():
        capture_images(body)
    m = _load_manifest()
    print(f"\ncaptured {len(FEATURES)} pages, {len(m)} images into {RAW}")


if __name__ == "__main__":
    main()
