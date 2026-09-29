#!/usr/bin/env python3
"""Convert the captured raw FF1 HTML into a flat markdown guide under ./main/.

Reads ./raw/pages/*.html and ./raw/images/ (written by crawl.py) and emits
single-directory markdown with images copied to ./main/images/.

The walkthrough (feature 11508) becomes numbered files 00..17; the seven
"Other Final Fantasy 1 Guides" become additional numbered files (18..24) in the
same directory so every cross-guide link can resolve to a local file + anchor.

Usage: process.py [raw_dir] [out_dir]   (defaults ./raw and ./main)
"""
import os
import re
import sys
import json
import shutil

from bs4 import BeautifulSoup, NavigableString, Tag

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "raw")
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, "main")
PAGES = os.path.join(RAW, "pages")
RAW_IMG = os.path.join(RAW, "images")
OUT_IMG = os.path.join(OUT, "images")

MANIFEST = json.load(open(os.path.join(RAW_IMG, "manifest.json"), encoding="utf-8")) \
    if os.path.exists(os.path.join(RAW_IMG, "manifest.json")) else {}

# feature id -> (output slug/number, canonical title). Walkthrough first.
OTHER_ORDER = [
    ("11520", "character-names"),
    ("11509", "classes-and-jobs"),
    ("11513", "weapons"),
    ("11511", "magic-list"),
    ("11510", "job-upgrades"),
    ("11519", "bosses"),
    ("11518", "maps"),
]
MAIN_NUM = "11508"

_img_copied = {}


def slugify(s):
    s = re.sub(r"[^\w\s-]", "", s, flags=re.U).strip().lower()
    return re.sub(r"[\s_-]+", "-", s)


def local_image(url):
    """Copy an image from raw into OUT_IMG, return 'images/<file>' ref (or None)."""
    if url in _img_copied:
        return _img_copied[url]
    fn = MANIFEST.get(url)
    if not fn:
        _img_copied[url] = None
        return None
    src = os.path.join(RAW_IMG, fn)
    if not os.path.exists(src):
        _img_copied[url] = None
        return None
    os.makedirs(OUT_IMG, exist_ok=True)
    dst = os.path.join(OUT_IMG, fn)
    if not os.path.exists(dst):
        shutil.copy2(src, dst)
    ref = os.path.join("images", fn)
    _img_copied[url] = ref
    return ref


def is_image_url(url):
    if not url or not url.startswith("http"):
        return False
    return ("images.rpgsite.net" in url or "assets.rpgsite.net" in url) and \
        (re.search(r"\.(jpg|jpeg|png|webp|gif)$", url.split("?")[0], re.I)
         or "/images/images/" in url or "assets.rpgsite.net/images" in url)


# --- link rewriting ---------------------------------------------------------

def build_feature_map():
    """feature id -> filename (without dir) for all features we emit."""
    fmap = {MAIN_NUM: None}  # main sections handled specially
    for i, (num, slug) in enumerate(OTHER_ORDER, start=18):
        fmap[num] = f"{i:02d}-{slug}.md"
    return fmap


FEATURE_FILE = build_feature_map()


def resolve_link(href, anchors, main_toc):
    """Return a rewritten href, or None to keep original.

    anchors: dict for the current doc {anchor_id: section_file}.
    """
    m = re.match(r"https?://www\.rpgsite\.net/feature/(\d+)(?:-[^#]*)?(?:#(.*))?$", href)
    if m:
        num, frag = m.group(1), m.group(2)
        if num == MAIN_NUM:
            # link back into the walkthrough -> section file
            if frag and frag in main_toc:
                return f"{main_toc[frag]}"
            return "00-intro.md"
        ffile = FEATURE_FILE.get(num)
        if ffile:
            return f"{ffile}#{frag}" if frag else ffile
        return href
    if href.startswith("#"):
        # intra-doc anchor: keep (heading slugs are preserved as explicit anchors)
        return href
    if href.startswith("/") or href.startswith("http"):
        return href  # leave external / site-root alone
    return href


# --- node -> markdown -------------------------------------------------------

def inline_to_md(node):
    if isinstance(node, NavigableString):
        return str(node)
    if not isinstance(node, Tag):
        return ""
    name = node.name
    if name in ("strong", "b"):
        inner = "".join(inline_to_md(c) for c in node.children)
        return f"**{inner}**"
    if name in ("em", "i"):
        inner = "".join(inline_to_md(c) for c in node.children)
        return f"*{inner}*"
    if name == "a":
        href = node.get("href", "")
        inner = "".join(inline_to_md(c) for c in node.children).strip()
        # empty anchor used purely for heading id markers -> nothing
        if not inner and node.get("id"):
            return ""
        if not inner:
            return ""
        if href and is_image_url(href):
            ref = local_image(href)
            return f"[{inner}]({ref})" if ref else f"[{inner}]({href})"
        return f"[{inner}]({href})"
    if name == "br":
        return "\n"
    if name == "code":
        return f"`{node.get_text()}`"
    if name in ("script", "style"):
        return ""
    return "".join(inline_to_md(c) for c in node.children)


def heading_anchors(h):
    """Explicit anchor ids embedded in a heading via <a id=.. name=..>."""
    ids = []
    for a in h.find_all("a"):
        for key in ("id", "name"):
            v = a.get(key)
            if v and v not in ids:
                ids.append(v)
    return ids


def block_to_md(child):
    if isinstance(child, NavigableString):
        return str(child).strip() or None
    if not isinstance(child, Tag):
        return None
    if child.name == "div":
        if "ad" in (child.get("class") or []):
            return None
        return child.get_text(" ", strip=True) or None
    if re.match(r"h[1-5]$", child.name):
        level = int(child.name[1])
        text = child.get_text(" ", strip=True)
        ids = heading_anchors(child)
        if not text:
            return None
        head = "#" * level + " " + text
        if ids:
            tags = "".join(f'<a id="{i}"></a>' for i in ids)
            return f"{head} {tags}"
        return head
    if child.name == "p":
        return inline_to_md(child).strip() or None
    if child.name == "blockquote":
        inner = blocks_to_md(list(child.children))
        return "\n".join("> " + l for l in inner.split("\n"))
    if child.name == "figure":
        return figure_to_md(child)
    if child.name in ("ul", "ol"):
        return list_to_md(child)
    if child.name == "table":
        return table_to_md(child)
    return None


def figure_to_md(fig):
    a = fig.find("a")
    url = a["href"] if a and a.get("href") else None
    if not url:
        img = fig.find("img")
        if img:
            url = img.get("data-src") or img.get("src")
    if not url or not url.startswith("http"):
        return None
    ref = local_image(url)
    if not ref:
        return None
    fn = os.path.basename(url.split("?")[0])
    return f"![{fn}]({ref})"


def list_to_md(ul, indent=0):
    lines = []
    ordered = ul.name == "ol"
    n = 0
    for li in ul.find_all("li", recursive=False):
        n += 1
        nested = li.find_all(["ul", "ol"], recursive=False)
        for nl in nested:
            nl.extract()
        marker = f"{n}." if ordered else "-"
        text = re.sub(r"\s+", " ", inline_to_md(li).strip())
        pad = "  " * indent
        lines.append(f"{pad}{marker} {text}")
        for nl in nested:
            lines.append(list_to_md(nl, indent + 1))
    return "\n".join(lines)


def table_to_md(tbl):
    out = []
    for i, tr in enumerate(tbl.find_all("tr")):
        cells = tr.find_all(["th", "td"])
        out.append("| " + " | ".join(c.get_text(" ", strip=True) for c in cells) + " |")
        if i == 0:
            out.append("|" + "|".join(["---"] * len(cells)) + "|")
    return "\n".join(out)


def blocks_to_md(children):
    return "\n\n".join(b for b in (block_to_md(c) for c in children) if b)


# --- document assembly ------------------------------------------------------

def load_story(num):
    soup = BeautifulSoup(open(os.path.join(PAGES, f"{num}.html"),
                             encoding="utf-8").read(), "lxml")
    story = soup.find(id="article-story") or soup.find("article")
    h1 = soup.find("h1")
    return story, (h1.get_text(" ", strip=True) if h1 else "")


def main_sections_and_intro(story):
    """Split walkthrough story into (intro_nodes, [ {title,file,nodes} ])."""
    children = [c for c in story.children if isinstance(c, Tag)]
    sections, intro_nodes, cur = [], [], None
    num_re = re.compile(r"^(\d+)\.\s+(.*)$")
    for c in children:
        if c.name == "h2":
            text = c.get_text(" ", strip=True)
            m = num_re.match(text)
            if m:
                fname = f"{int(m.group(1)):02d}-{slugify(m.group(2))}.md"
                cur = {"title": text, "file": fname, "nodes": []}
                sections.append(cur)
            elif cur is None:
                intro_nodes.append(c)
            else:
                cur["nodes"].append(c)
        elif cur is None:
            if c.name == "blockquote" and "Other Final Fantasy 1 Guides" in c.get_text():
                continue  # replaced by our own ToC
            intro_nodes.append(c)
        else:
            cur["nodes"].append(c)
    return intro_nodes, sections


def rewrite_links(md, main_toc):
    """Rewrite rpgsite feature links found in produced markdown to local files."""
    def repl(m):
        href = m.group(2)
        new = resolve_link(href, None, main_toc)
        return f"{m.group(1)}{new}{m.group(3)}"
    # [text](href)
    return re.sub(r"(\[[^\]]*\]\()([^)\s]+)(\))", repl, md)


def main():
    os.makedirs(OUT, exist_ok=True)

    # Build main_toc: anchor id -> its section file.
    story, main_title = load_story(MAIN_NUM)
    intro_nodes, sections = main_sections_and_intro(story)

    main_toc = {}
    for c in story.children:
        if isinstance(c, Tag) and c.name == "h2":
            ids = heading_anchors(c)
            text = c.get_text(" ", strip=True)
            m = re.match(r"^(\d+)\.\s+(.*)$", text)
            if m and ids:
                fname = f"{int(m.group(1)):02d}-{slugify(m.group(2))}.md"
                for i in ids:
                    main_toc[i] = fname

    # write section files (link rewriting done per file after content built)
    produced = []
    for s in sections:
        body = blocks_to_md(s["nodes"])
        body = rewrite_links(body, main_toc)
        full = f"# {s['title']}\n\n{body}\n"
        with open(os.path.join(OUT, s["file"]), "w", encoding="utf-8") as f:
            f.write(full)
        produced.append((s["title"], s["file"]))

    # intro
    intro_md = rewrite_links(blocks_to_md(intro_nodes), main_toc)
    with open(os.path.join(OUT, "00-intro.md"), "w", encoding="utf-8") as f:
        f.write("# Final Fantasy 1 Walkthrough - Getting Started\n\n" + intro_md + "\n")

    # sibling guides -> numbered files 18..24
    sibling_toc = []
    for i, (num, slug) in enumerate(OTHER_ORDER, start=18):
        st, title = load_story(num)
        body = rewrite_links(blocks_to_md([c for c in st.children if isinstance(c, Tag)]),
                             main_toc)
        fname = f"{i:02d}-{slug}.md"
        hdr = f"# {title}\n\n> Source: https://www.rpgsite.net/feature/{num}\n\n"
        with open(os.path.join(OUT, fname), "w", encoding="utf-8") as f:
            f.write(hdr + body + "\n")
        sibling_toc.append((title, fname))
        produced.append((title, fname))

    # README with full flat ToC (walkthrough sections + other guides)
    def anchor_of(title):
        return "#" + slugify(title)

    toc_main = "\n".join(f"- [{t}](./{f})" for t, f in produced[:len(sections)])
    toc_other = "\n".join(f"- [{t}](./{f})" for t, f in sibling_toc)
    readme = (
        f"# {main_title}\n\n"
        "> Source: https://www.rpgsite.net/feature/11508-final-fantasy-1-walkthrough-"
        "where-to-go-dungeon-maps-ff1-step-by-step-guide\n\n"
        "## Walkthrough\n\n" + toc_main + "\n\n"
        "## Other Final Fantasy 1 Guides\n\n" + toc_other + "\n"
    )
    with open(os.path.join(OUT, "README.md"), "w", encoding="utf-8") as f:
        f.write(readme)

    print(f"main sections: {len(sections)}, sibling guides: {len(sibling_toc)}, "
          f"images copied: {len(_img_copied)}")


if __name__ == "__main__":
    main()
